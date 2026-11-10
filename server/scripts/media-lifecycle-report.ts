import 'dotenv/config';
import {prisma} from '../src/database/prisma.js';
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
    deletionPhaseJobs,
    verificationPhaseJobs,
    finalVerificationJobs,
    dueDeletions,
    dueVerifications,
    repeatedFailures,
    oldestJob,
  ] = await Promise.all([
    prisma.projectMedia.count({
      where: { status: 'PENDING' },
    }),

    prisma.projectMedia.count({
      where: { status: 'FINALIZING' },
    }),

    prisma.projectMedia.count({
      where: {
        status: {
          in: ['PENDING', 'FINALIZING', 'FAILED'],
        },
        createdAt: { lte: expiredBefore },
        updatedAt: { lte: expiredBefore },
      },
    }),

    prisma.projectMedia.count({
      where: { status: 'FAILED' },
    }),

    // All outstanding deletion and verification jobs.
    prisma.storageDeletionJob.count(),

    prisma.storageDeletionJob.count({
      where: { phase: 'DELETE' },
    }),

    prisma.storageDeletionJob.count({
      where: { phase: 'VERIFY' },
    }),

    prisma.storageDeletionJob.count({
      where: {
        phase: 'VERIFY',
        verificationPasses: 1,
      },
    }),

    prisma.storageDeletionJob.count({
      where: {
        phase: 'DELETE',
        nextAttemptAt: { lte: now },
      },
    }),

    prisma.storageDeletionJob.count({
      where: {
        phase: 'VERIFY',
        nextAttemptAt: { lte: now },
      },
    }),

    // Consecutive errors, not total worker claims.
    prisma.storageDeletionJob.count({
      where: {
        consecutiveFailures: { gte: 3 },
      },
    }),

    prisma.storageDeletionJob.findFirst({
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
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
          deletionPhaseJobs,
          verificationPhaseJobs,
          finalVerificationJobs,
          dueDeletions,
          dueVerifications,
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