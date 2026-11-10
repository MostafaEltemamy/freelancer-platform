import {prisma} from '../../database/prisma.js';
import type {MediaHealthSnapshot} from './media-health.policy.js';

const MINUTE_MS = 60_000;

function before(now: Date, minutes: number): Date {
  return new Date(
    now.getTime() - minutes * MINUTE_MS,
  );
}

/**
 * Resolve named Prisma count queries without relying
 * on positional Promise.all destructuring.
 *
 * This prevents accidentally assigning a job count
 * to an unrelated media metric.
 */
async function resolveCounts<
  T extends Record<string, PromiseLike<number>>
>(
  queries: T,
): Promise<{ [K in keyof T]: number }> {
  const pairs = await Promise.all(
    Object.entries(queries).map(
      async ([name, query]) =>
        [name, await query] as const,
    ),
  );

  return Object.fromEntries(pairs) as {
    [K in keyof T]: number;
  };
}

/**
 * Collect aggregate operational counts.
 *
 * Never selects storage keys, filenames, emails,
 * account IDs, or other personally identifying data.
 *
 * Read-only: no jobs are claimed, modified, or deleted.
 */
export async function collectMediaHealthSnapshot(
  now = new Date(),
): Promise<MediaHealthSnapshot> {
  if (!Number.isFinite(now.getTime())) {
    throw new RangeError(
      'Invalid health snapshot time.',
    );
  }

  const stalled20 = before(now, 20);
  const stalled60 = before(now, 60);

  const expired60 = before(now, 60);
  const expired120 = before(now, 120);

  const overdue10 = before(now, 10);
  const overdue60 = before(now, 60);

  const unfinishedStatuses = [
    'PENDING',
    'FINALIZING',
    'FAILED',
  ] as const;

  const media = await resolveCounts({
    pendingUploads: prisma.projectMedia.count({
      where: { status: 'PENDING' },
    }),

    finalizingUploads: prisma.projectMedia.count({
      where: { status: 'FINALIZING' },
    }),

    stalledFinalizations20m:
      prisma.projectMedia.count({
        where: {
          status: 'FINALIZING',
          updatedAt: { lte: stalled20 },
        },
      }),

    stalledFinalizations60m:
      prisma.projectMedia.count({
        where: {
          status: 'FINALIZING',
          updatedAt: { lte: stalled60 },
        },
      }),

    expiredUploads: prisma.projectMedia.count({
      where: {
        status: { in: [...unfinishedStatuses] },
        createdAt: { lte: expired60 },
        updatedAt: { lte: expired60 },
      },
    }),

    criticallyExpiredUploads:
      prisma.projectMedia.count({
        where: {
          status: { in: [...unfinishedStatuses] },
          createdAt: { lte: expired120 },
          updatedAt: { lte: expired120 },
        },
      }),

    failedUploads: prisma.projectMedia.count({
      where: { status: 'FAILED' },
    }),
  });

  const storageCleanup = await resolveCounts({
    queuedJobs: prisma.storageDeletionJob.count(),

    deleteJobs: prisma.storageDeletionJob.count({
      where: { phase: 'DELETE' },
    }),

    verifyJobs: prisma.storageDeletionJob.count({
      where: { phase: 'VERIFY' },
    }),

    dueJobs: prisma.storageDeletionJob.count({
      where: {
        nextAttemptAt: { lte: now },
      },
    }),

    overdueJobs10m:
      prisma.storageDeletionJob.count({
        where: {
          nextAttemptAt: { lte: overdue10 },
        },
      }),

    overdueJobs60m:
      prisma.storageDeletionJob.count({
        where: {
          nextAttemptAt: { lte: overdue60 },
        },
      }),

    failures3: prisma.storageDeletionJob.count({
      where: {
        consecutiveFailures: { gte: 3 },
      },
    }),

    failures5: prisma.storageDeletionJob.count({
      where: {
        consecutiveFailures: { gte: 5 },
      },
    }),

    expiredLeases:
      prisma.storageDeletionJob.count({
        where: {
          leaseToken: { not: null },
          leaseUntil: { lt: now },
        },
      }),
  });

  return {
    checkedAt: now.toISOString(),
    media,
    storageCleanup,
  };
}
