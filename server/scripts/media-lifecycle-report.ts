import 'dotenv/config';
import { prisma } from '../src/database/prisma.js';
import {ABANDONED_MEDIA_AGE_MS} from '../src/modules/freelancer/project-media.reconciliation.js';

async function main(): Promise<void> {
  const now = new Date();

  const expiredBefore = new Date(
    now.getTime() - ABANDONED_MEDIA_AGE_MS,
  );

  const [
    pendingUploads,
    expiredUploads,
    failedUploads,
    queuedDeletions,
    dueDeletions,
    repeatedFailures,
    oldestJob,
  ] = await Promise.all([
    prisma.projectMedia.count({
      where: {
        status: 'PENDING',
      },
    }),

    prisma.projectMedia.count({
      where: {
        status: {
          in: ['PENDING', 'FAILED'],
        },
        createdAt: {
          lte: expiredBefore,
        },
        updatedAt: {
          lte: expiredBefore,
        },
      },
    }),

    prisma.projectMedia.count({
      where: {
        status: 'FAILED',
      },
    }),

    prisma.storageDeletionJob.count(),

    prisma.storageDeletionJob.count({
      where: {
        nextAttemptAt: {
          lte: now,
        },
      },
    }),

    prisma.storageDeletionJob.count({
      where: {
        attempts: {
          gte: 3,
        },
      },
    }),

    prisma.storageDeletionJob.findFirst({
      select: {
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    }),
  ]);

  const oldestCleanupAgeMinutes = oldestJob
    ? Math.floor(
        (now.getTime() -
          oldestJob.createdAt.getTime()) /
          60_000,
      )
    : null;

  console.log(
    JSON.stringify(
      {
        checkedAt: now.toISOString(),

        media: {
          pendingUploads,
          expiredUploads,
          failedUploads,
        },

        storageCleanup: {
          queuedDeletions,
          dueDeletions,
          repeatedFailures,
          oldestCleanupAgeMinutes,
        },
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} catch (error) {
  console.error(
    'Media lifecycle report failed:',
    error instanceof Error
      ? error.name
      : 'UnknownError',
  );

  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
