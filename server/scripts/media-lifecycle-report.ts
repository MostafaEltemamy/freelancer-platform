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
    finalizingUploads,
    expiredUploads,
    failedUploads,
    queuedDeletions,
    dueDeletions,
    repeatedFailures,
    oldestJob,
  ] = await Promise.all([
    // 1. Pending uploads
    prisma.projectMedia.count({
      where: {
        status: 'PENDING',
      },
    }),

    // 2. Currently finalizing uploads
    prisma.projectMedia.count({
      where: {
        status: 'FINALIZING',
      },
    }),

    // 3. Abandoned uploads eligible for reconciliation
    prisma.projectMedia.count({
      where: {
        status: {
          in: ['PENDING', 'FINALIZING', 'FAILED'],
        },
        createdAt: {
          lte: expiredBefore,
        },
        updatedAt: {
          lte: expiredBefore,
        },
      },
    }),

    // 4. Failed uploads
    prisma.projectMedia.count({
      where: {
        status: 'FAILED',
      },
    }),

    // 5. All queued storage deletions
    prisma.storageDeletionJob.count(),

    // 6. Deletion jobs due for processing
    prisma.storageDeletionJob.count({
      where: {
        nextAttemptAt: {
          lte: now,
        },
      },
    }),

    // 7. Jobs that have failed repeatedly
    prisma.storageDeletionJob.count({
      where: {
        attempts: {
          gte: 3,
        },
      },
    }),

    // 8. Oldest pending cleanup job
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
        (
          now.getTime() -
          oldestJob.createdAt.getTime()
        ) / 60_000,
      )
    : null;

  console.log(
    JSON.stringify(
      {
        checkedAt: now.toISOString(),

        media: {
          pendingUploads,
          finalizingUploads,
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