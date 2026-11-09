import { randomUUID } from 'node:crypto';
import { prisma } from '../../database/prisma.js';

import {
  withEditablePortfolio,
  PortfolioPublishedError,
} from './portfolio-guard.js';

import {
  classifyMedia,
  createProjectMediaStorageKey,
  PROJECT_MEDIA_LIMITS,
} from './project-media.policy.js';

import type {
  MediaUploadIntent,
} from './project-media.policy.js';

import {
  MediaUploadInvalidError,
  presignImageUpload,
  presignImagePreview,
  readUploadedImage,
  uploadExpirySeconds,
  writeImagePreview,
} from './project-media.storage.js';

import {
  processProjectImage,
} from './project-media.image.js';

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
export async function finalizeProjectImageUpload(
  userId: string,
  projectId: string,
  mediaId: string,
) {
  const media = await prisma.projectMedia.findFirst({
    where: {
      id: mediaId,
      projectId,
      project: {
        profile: { userId },
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

      project: {
        select: {
          profile: {
            select: {
              status: true,
            },
          },
        },
      },
    },
  });

  if (!media) {
    throw new MediaNotFoundError();
  }

  if (media.project.profile.status !== 'DRAFT') {
    throw new PortfolioPublishedError();
  }

  if (media.status !== 'PENDING' || media.kind !== 'IMAGE') {
    throw new MediaStateConflictError();
  }

  if (
    Date.now() - media.createdAt.getTime() >
    PENDING_LIFETIME_MS
  ) {
    throw new MediaStateConflictError(
      'This upload session expired. Please start a new upload.',
    );
  }

  const source = await readUploadedImage(
    media.storageKey,
    media.fileSizeBytes,
    media.mimeType,
  );

  const processed = await processProjectImage(
    source,
    media.mimeType,
  );

  const previewKey = media.previewKey;
  if (!previewKey) {
    throw new MediaStateConflictError(
      'This upload was created before the latest ' +
      'media update. Please remove it and upload again.',
    );
  }

  // This preview is derived from independently validated
  // bytes, not from the browser's claimed file metadata.
  await writeImagePreview(
    previewKey,
    processed.buffer,
  );

  // Re-check ownership and publication while holding the
  // same profile lock used by the rest of the portfolio.
  // A failed transaction leaves the preview private and
  // eligible for later orphan cleanup.
  return withEditablePortfolio(
    userId,
    async (tx, profileId) => {
      const project = await tx.portfolioProject.findFirst({
        where: {
          id: projectId,
          profileId,
        },
        select: { id: true },
      });

      if (!project) {
        throw new MediaProjectNotFoundError();
      }

      const updated = await tx.projectMedia.updateMany({
        where: {
          id: mediaId,
          projectId,
          status: 'PENDING',
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
          'This image was already updated. Refresh your media list.',
        );
      }

      return tx.projectMedia.findUniqueOrThrow({
        where: { id: mediaId },
        select: MEDIA_SELECT,
      });
    },
  );
}
