import type {
  Prisma,
} from '../../generated/prisma/client.js';

import {
  withEditablePortfolio,
} from './portfolio-guard.js';

import type {
  ReorderMediaInput,
  SetMediaCoverInput,
  UpdateMediaDetailsInput,
} from './project-media.management.schemas.js';

// ---------------------------------------------------------
// Domain errors
// ---------------------------------------------------------

export class MediaGalleryNotFoundError extends Error {
  constructor() {
    super('Project image not found.');
    this.name = 'MediaGalleryNotFoundError';
  }
}

export class MediaGalleryNotReadyError extends Error {
  constructor() {
    super(
      'This image must finish uploading before you can edit it.',
    );
    this.name = 'MediaGalleryNotReadyError';
  }
}

export class MediaGalleryVersionError extends Error {
  constructor() {
    super(
      'This gallery has changed. Refresh your images before saving.',
    );
    this.name = 'MediaGalleryVersionError';
  }
}

export class MediaGalleryOrderError extends Error {
  constructor() {
    super(
      'Gallery order must include every ready image exactly once.',
    );
    this.name = 'MediaGalleryOrderError';
  }
}

// ---------------------------------------------------------
// Shared ownership and state checks
// ---------------------------------------------------------

async function requireOwnedProject(
  tx: Prisma.TransactionClient,
  profileId: string,
  projectId: string,
): Promise<void> {
  const project = await tx.portfolioProject.findFirst({
    where: {
      id: projectId,
      profileId,
    },
    select: {
      id: true,
    },
  });

  if (!project) {
    throw new MediaGalleryNotFoundError();
  }
}

async function requireReadyImage(
  tx: Prisma.TransactionClient,
  projectId: string,
  mediaId: string,
) {
  const media = await tx.projectMedia.findFirst({
    where: {
      id: mediaId,
      projectId,
    },
    select: {
      id: true,
      version: true,
      status: true,
      kind: true,
      isCover: true,
    },
  });

  if (!media) {
    throw new MediaGalleryNotFoundError();
  }

  if (
    media.status !== 'READY' ||
    media.kind !== 'IMAGE'
  ) {
    throw new MediaGalleryNotReadyError();
  }

  return media;
}

function requireCurrentVersion(
  actual: number,
  expected: number,
): void {
  if (actual !== expected) {
    throw new MediaGalleryVersionError();
  }
}

// ---------------------------------------------------------
// Update alternative text and caption
// ---------------------------------------------------------

export async function updateMyMediaDetails(
  userId: string,
  projectId: string,
  mediaId: string,
  input: UpdateMediaDetailsInput,
) {
  return withEditablePortfolio(
    userId,
    async (tx, profileId) => {
      await requireOwnedProject(
        tx,
        profileId,
        projectId,
      );

      const media = await requireReadyImage(
        tx,
        projectId,
        mediaId,
      );

      requireCurrentVersion(
        media.version,
        input.version,
      );

      const updated = await tx.projectMedia.updateMany({
        where: {
          id: mediaId,
          projectId,
          kind: 'IMAGE',
          status: 'READY',
          version: input.version,
        },
        data: {
          altText: input.altText,
          caption: input.caption,
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new MediaGalleryVersionError();
      }

      return tx.projectMedia.findUniqueOrThrow({
        where: { id: mediaId },
        select: {
          id: true,
          altText: true,
          caption: true,
          version: true,
        },
      });
    },
  );
}

// ---------------------------------------------------------
// Select one cover image
// ---------------------------------------------------------

export async function setMyProjectCover(
  userId: string,
  projectId: string,
  mediaId: string,
  input: SetMediaCoverInput,
) {
  return withEditablePortfolio(
    userId,
    async (tx, profileId) => {
      await requireOwnedProject(
        tx,
        profileId,
        projectId,
      );

      const target = await requireReadyImage(
        tx,
        projectId,
        mediaId,
      );

      requireCurrentVersion(
        target.version,
        input.version,
      );

      // Re-selecting the existing cover does not change
      // image versions or touch the database media rows.
      if (target.isCover) {
        return {
          id: target.id,
          version: target.version,
          isCover: true,
        };
      }

      // Both changes run under the same locked-profile
      // transaction. A failure rolls back both changes.
      //
      // First remove the existing cover, if any.
      await tx.projectMedia.updateMany({
        where: {
          projectId,
          isCover: true,
        },
        data: {
          isCover: false,
          version: { increment: 1 },
        },
      });

      // Then select the verified target. The database's
      // partial unique index independently guarantees
      // no more than one cover per project.
      const updated = await tx.projectMedia.updateMany({
        where: {
          id: mediaId,
          projectId,
          kind: 'IMAGE',
          status: 'READY',
          version: input.version,
        },
        data: {
          isCover: true,
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new MediaGalleryVersionError();
      }

      const cover = await tx.projectMedia.findUniqueOrThrow({
        where: { id: mediaId },
        select: {
          id: true,
          version: true,
          isCover: true,
        },
      });

      return cover;
    },
  );
}

// ---------------------------------------------------------
// Reorder verified gallery images atomically
// ---------------------------------------------------------

export async function reorderMyProjectMedia(
  userId: string,
  projectId: string,
  input: ReorderMediaInput,
) {
  return withEditablePortfolio(
    userId,
    async (tx, profileId) => {
      await requireOwnedProject(
        tx,
        profileId,
        projectId,
      );

      // Pending and failed uploads are not draggable
      // gallery items. They are deliberately excluded.
      const current = await tx.projectMedia.findMany({
        where: {
          projectId,
          kind: 'IMAGE',
          status: 'READY',
        },
        select: {
          id: true,
          version: true,
          sortOrder: true,
        },
        orderBy: [
          { sortOrder: 'asc' },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
      });

      if (current.length !== input.items.length) {
        throw new MediaGalleryOrderError();
      }

      const byId = new Map(
        current.map((item) => [item.id, item]),
      );

      for (const item of input.items) {
        const existing = byId.get(item.id);

        if (!existing) {
          throw new MediaGalleryOrderError();
        }

        requireCurrentVersion(
          existing.version,
          item.version,
        );
      }

      // No change means no unnecessary version increments.
      const orderUnchanged = input.items.every(
        (item, index) =>
          current[index]?.id === item.id,
      );

      if (orderUnchanged) {
        return {
          items: current.map((item) => ({
            id: item.id,
            version: item.version,
            sortOrder: item.sortOrder,
          })),
        };
      }

      // Update the entire ordered set inside one transaction.
      // All versions were checked before any write.
      for (const [index, item] of input.items.entries()) {
        const updated = await tx.projectMedia.updateMany({
          where: {
            id: item.id,
            projectId,
            kind: 'IMAGE',
            status: 'READY',
            version: item.version,
          },
          data: {
            sortOrder: index,
            version: { increment: 1 },
          },
        });

        if (updated.count !== 1) {
          throw new MediaGalleryVersionError();
        }
      }

      return {
        items: input.items.map((item, index) => ({
          id: item.id,
          version: item.version + 1,
          sortOrder: index,
        })),
      };
    },
  );
}
