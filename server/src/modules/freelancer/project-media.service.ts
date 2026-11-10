import { randomUUID } from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import {withEditablePortfolio, PortfolioPublishedError} from './portfolio-guard.js';
import {classifyMedia, createProjectMediaStorageKey, PROJECT_MEDIA_LIMITS} from './project-media.policy.js';
import type {MediaUploadIntent} from './project-media.policy.js';
import {
  MediaUploadInvalidError,
  presignImageUpload,
  presignImagePreview,
  readUploadedImage,
  uploadExpirySeconds,
  writeImagePreview,
  MediaStorageTimeoutError,
} from './project-media.storage.js';

import {processProjectImage} from './project-media.image.js';
import {withLockedProfile} from './profile-lock.js';

export const PENDING_LIFETIME_MS = 15 * 60_000;

const MEDIA_SELECT = {
  id: true,
  projectId: true,
  originalFilename: true,
  mimeType: true,
  fileSizeBytes: true,
  kind: true,
  status: true,
  isCover: true,
  sortOrder: true,
  sectionId: true,
  width: true,
  height: true,
  altText: true,
  caption: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  readyAt: true,
} as const;

export class MediaProjectNotFoundError extends Error {
  constructor() {
    super('Project not found.');
    this.name = 'MediaProjectNotFoundError';
  }
}

export class MediaNotFoundError extends Error {
  constructor() {
    super('Image not found.');
    this.name = 'MediaNotFoundError';
  }
}

export class MediaLimitError extends Error {
  constructor() {
    super(
      'This project has reached its media limit.',
    );
    this.name = 'MediaLimitError';
  }
}

export class MediaStateConflictError extends Error {
  constructor(
    message = 'This upload can no longer be completed.',
  ) {
    super(message);
    this.name = 'MediaStateConflictError';
  }
}

/**
 * Create a pending upload for one owned project.
 *
 * The transaction uses the existing profile lock,
 * preventing races with project publication or other
 * media reservations for the same freelancer.
 */
export async function prepareProjectImageUpload(
  userId: string,
  input: MediaUploadIntent,
) {
  if (classifyMedia(input.mimeType) !== 'IMAGE') {
    throw new MediaUploadInvalidError(
      'Please select a JPEG, PNG or WebP image.',
    );
  }

  const media = await withEditablePortfolio(
    userId,
    async (tx, profileId) => {
      const project = await tx.portfolioProject.findFirst({
        where: {
          id: input.projectId,
          profileId,
        },
        select: { id: true },
      });

      if (!project) {
        throw new MediaProjectNotFoundError();
      }

      const count = await tx.projectMedia.count({
        where: {
          projectId: project.id,
        },
      });

      if (
        count >= PROJECT_MEDIA_LIMITS.maxItemsPerProject
      ) {
        throw new MediaLimitError();
      }

      return tx.projectMedia.create({
        data: {
          projectId: project.id,          
          storageKey: createProjectMediaStorageKey(input),
          // Reserve the future preview key immediately.
          // This keeps deletion cleanup aware of the key
          // even when image finalization is interrupted.
          previewKey:
            `projects/${input.projectId}/previews/` +
            `${randomUUID()}.webp`,
          originalFilename: input.originalFilename,
          mimeType: input.mimeType,
          fileSizeBytes: input.fileSizeBytes,
          kind: 'IMAGE',
          status: 'PENDING',
          sortOrder: count,
        },

        select: {
          ...MEDIA_SELECT,
          storageKey: true,
        },
      });
    },
  );

  try {
    const uploadUrl = await presignImageUpload(
      media.storageKey,
      media.mimeType,
    );

    const {
      storageKey: _storageKey,
      ...publicMedia
    } = media;

    return {
      media: publicMedia,

      upload: {
        method: 'PUT' as const,
        url: uploadUrl,
        headers: {
          'Content-Type': media.mimeType,
        },
        expiresInSeconds: uploadExpirySeconds(),
      },
    };
  } catch (error) {
    // A signing failure must not consume a media slot.
    // No browser has received the upload URL.
    await prisma.projectMedia.deleteMany({
      where: {
        id: media.id,
        status: 'PENDING',
      },
    }).catch(() => {
      // A reconciliation job will address failed cleanup.
    });

    throw error;
  }
}

/**
 * List images for one authenticated project owner.
 *
 * Only READY images with a server-generated WebP preview
 * receive a temporary display URL.
 *
 * Never return the original storage key or preview key.
 */
export async function listMyProjectMedia(
  userId: string,
  projectId: string,
) {
  const project =
    await prisma.portfolioProject.findFirst({
      where: {
        id: projectId,
        profile: {
          userId,
        },
      },
      select: {
        id: true,
      },
    });

  if (!project) {
    throw new MediaProjectNotFoundError();
  }

  const records = await prisma.projectMedia.findMany({
    where: {
      projectId: project.id,
    },
    select: {
      ...MEDIA_SELECT,

      // Internal only. Removed from the HTTP response.
      previewKey: true,
    },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    take: PROJECT_MEDIA_LIMITS.maxItemsPerProject,
  });

  return Promise.all(
    records.map(async (record) => {
      const {
        previewKey,
        ...media
      } = record;

      const previewUrl =
        media.status === 'READY' && previewKey
          ? await presignImagePreview(previewKey)
          : null;

  return {
    ...media,

    // FINALIZING is internal. Existing clients continue
    // to understand PENDING, READY and FAILED.
    status:
      media.status === 'FINALIZING'
        ? 'PENDING' as const
        : media.status,

    previewUrl,
  };

    }),
  );
}

/**
 * Read and verify an upload without holding a database
 * transaction open during network and image processing.
 *
 * The owner's DRAFT status is checked again atomically
 * before the final READY transition.
 */

/**
 * Internal dependency interface.
 *
 * Production uses the real R2 and Sharp functions.
 * Tests inject controlled implementations so race
 * conditions can be reproduced without accessing R2.
 */
export interface ImageFinalizationIO {
  readUploadedImage: typeof readUploadedImage;
  processProjectImage: typeof processProjectImage;
  writeImagePreview: typeof writeImagePreview;
}

/**
 * Claim one PENDING upload before storage processing.
 *
 * The profile lock serializes this claim with project
 * deletion, publication and account deletion.
 *
 * No network I/O takes place inside this transaction.
 */
export async function finalizeProjectImageUpload(
  userId: string,
  projectId: string,
  mediaId: string,
  io: ImageFinalizationIO = {
    readUploadedImage,
    processProjectImage,
    writeImagePreview,
  },
) {
  const media = await withLockedProfile(
    userId,
    async (tx, profile) => {
      if (!profile) {
        throw new MediaNotFoundError();
      }

      if (profile.status !== 'DRAFT') {
        throw new PortfolioPublishedError();
      }

      const existing =
        await tx.projectMedia.findFirst({
          where: {
            id: mediaId,
            projectId,
            project: {
              profileId: profile.id,
            },
          },
          select: {
            id: true,
            projectId: true,
            storageKey: true,
            previewKey: true,
            mimeType: true,
            fileSizeBytes: true,
            status: true,
            kind: true,
            version: true,
            createdAt: true,
          },
        });

      if (!existing) {
        throw new MediaNotFoundError();
      }

      if (
        existing.status !== 'PENDING' ||
        existing.kind !== 'IMAGE'
      ) {
        throw new MediaStateConflictError(
          'This image is already processing or completed.',
        );
      }

      if (
        Date.now() - existing.createdAt.getTime() >
        PENDING_LIFETIME_MS
      ) {
        throw new MediaStateConflictError(
          'This upload session expired. ' +
          'Please start a new upload.',
        );
      }

      if (!existing.previewKey) {
        throw new MediaStateConflictError(
          'This upload is missing its reserved preview. ' +
          'Please remove it and upload again.',
        );
      }

      // Exactly one completion request wins the claim.
      //
      // Do not increment the externally visible media
      // version yet. The READY transition will perform
      // the usual 1 -> 2 increment.
      const claimed =
        await tx.projectMedia.updateMany({
          where: {
            id: existing.id,
            projectId,
            status: 'PENDING',
            version: existing.version,
          },
          data: {
            status: 'FINALIZING',
          },
        });

      if (claimed.count !== 1) {
        throw new MediaStateConflictError(
          'This image is already being processed.',
        );
      }

      return existing;
    },
  );

  // The claim transaction has committed. The profile
  // and media row locks have now been released.
  //
  // Expensive work must happen outside the transaction.
  let previewWriteStarted = false;
  try {
    const source = await io.readUploadedImage(
      media.storageKey,
      media.fileSizeBytes,
      media.mimeType,
    );

    const processed = await io.processProjectImage(
      source,
      media.mimeType,
    );

    // The preview key was reserved when this upload
    // was created, before any browser received a URL.
    const previewKey = media.previewKey!;

    // Recheck that the upload is still claimed and
    // owned before starting an R2 preview write.
    //
    // This reduces unnecessary writes if a project
    // was deleted during image processing.
    const stillExists =
      await prisma.projectMedia.findFirst({
        where: {
          id: media.id,
          projectId,
          version: media.version,
          status: 'FINALIZING',
          project: {
            profile: { userId },
          },
        },
        select: { id: true },
      });

    if (!stillExists) {
      throw new MediaStateConflictError(
        'This upload was removed during processing.',
      );
    }

    previewWriteStarted = true;

    await io.writeImagePreview(
      previewKey,
      processed.buffer,
    );

    // Atomically verify ownership and publication again.
    // A deleted project/account cannot become READY.
    return await withEditablePortfolio(
      userId,
      async (tx, profileId) => {
        const project =
          await tx.portfolioProject.findFirst({
            where: {
              id: projectId,
              profileId,
            },
            select: { id: true },
          });

        if (!project) {
          throw new MediaProjectNotFoundError();
        }

        const updated =
          await tx.projectMedia.updateMany({
            where: {
              id: media.id,
              projectId,
              status: 'FINALIZING',
              version: media.version,
            },
            data: {
              status: 'READY',
              previewKey,
              width: processed.width,
              height: processed.height,
              readyAt: new Date(),
              version: { increment: 1 },
            },
          });

        if (updated.count !== 1) {
          throw new MediaStateConflictError(
            'This upload changed during processing.',
          );
        }

        return tx.projectMedia.findUniqueOrThrow({
          where: { id: media.id },
          select: MEDIA_SELECT,
        });
      },
    );
  } catch (error) {
    // A timed-out R2 request can still commit remotely.
    //
    // Also treat failures after a preview PUT has started
    // as ambiguous, unless the payload was definitively
    // rejected as invalid.
    //
    // Leave FINALIZING in place. The reconciliation worker
    // can reclaim it after the abandonment window.
    if (
      error instanceof MediaStorageTimeoutError ||
      (
        previewWriteStarted &&
        !(error instanceof MediaUploadInvalidError)
      )
    ) {
      throw error;
    }

    // Invalid image data is terminal; a missing upload
    // or transient storage failure may be retried.
    //
    // If the project/account was deleted, updateMany
    // affects zero records and cannot resurrect it.
    const nextStatus =
      error instanceof MediaUploadInvalidError
        ? 'FAILED'
        : 'PENDING';

    try {
      await prisma.projectMedia.updateMany({
        where: {
          id: media.id,
          projectId,
          status: 'FINALIZING',
          version: media.version,
        },
        data: {
          status: nextStatus,
        },
      });
    } catch {
      // A database outage or process interruption may
      // leave the FINALIZING record in place.
      // The existing reconciliation worker will recover
      // it after the abandonment threshold.
    }

    throw error;
  }
}