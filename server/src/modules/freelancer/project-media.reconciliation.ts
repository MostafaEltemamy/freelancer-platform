import { prisma } from '../../database/prisma.js';
import {enqueueMediaObjectCleanup} from './storage-deletion.queue.js';
import {PENDING_LIFETIME_MS} from './project-media.service.js';

// ---------------------------------------------------------
// Maintenance policy
// ---------------------------------------------------------

// Upload finalization currently expires after 15 minutes.
// We wait substantially longer before reclaiming metadata.
export const ABANDONED_MEDIA_AGE_MS =
  60 * 60_000;

if (
  ABANDONED_MEDIA_AGE_MS <=
  PENDING_LIFETIME_MS + 5 * 60_000
) {
  throw new Error(
    'Media reconciliation must wait longer than ' +
    'the upload finalization lifetime.',
  );
}

// Give storage operations an additional grace period
// after reconciliation before the first delete attempt.
const RECONCILED_STORAGE_GRACE_MS =
  30 * 60_000;

const MAX_BATCH_SIZE = 25;
const WORKER_INTERVAL_MS = 60_000;

// ---------------------------------------------------------
// Types
// ---------------------------------------------------------

export interface ReconciliationResult {
  examined: number;
  removed: number;
  skipped: number;
}

// ---------------------------------------------------------
// Reconcile abandoned media records
// ---------------------------------------------------------

/**
 * Find expired uploads and move their object references
 * into the durable storage-deletion outbox.
 *
 * Eligible records:
 *
 * - PENDING or FAILED
 * - Created more than 60 minutes ago
 * - Not modified for at least 60 minutes
 *
 * READY records are never selected.
 *
 * Each deletion is conditional on its original version,
 * status and timestamps. A concurrent change prevents
 * that row from being removed.
 *
 * The database row removal and outbox insertion happen
 * in the same PostgreSQL transaction.
 */
export async function reconcileAbandonedProjectMedia(
  batchSize = MAX_BATCH_SIZE,
  options: {
    onlyProjectId?: string;
  } = {},
): Promise<ReconciliationResult> {
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > MAX_BATCH_SIZE
  ) {
    throw new RangeError(
      'Invalid reconciliation batch size.',
    );
  }

  const now = new Date();

  const expiredBefore = new Date(
    now.getTime() - ABANDONED_MEDIA_AGE_MS,
  );

  const cleanupNotBefore = new Date(
    now.getTime() + RECONCILED_STORAGE_GRACE_MS,
  );

  const candidates = await prisma.projectMedia.findMany({
    where: {
      ...(options.onlyProjectId
        ? { projectId: options.onlyProjectId }
        : {}),

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

    select: {
      id: true,
      version: true,
      storageKey: true,
      previewKey: true,
      createdAt: true,
    },

    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],

    take: batchSize,
  });

  let removed = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const didRemove = await prisma.$transaction(
      async (tx) => {
        // Compare-and-delete inside the transaction.
        // If another operation changed the record after
        // our initial read, this update affects zero rows.
        const result = await tx.projectMedia.deleteMany({
          where: {
            id: candidate.id,
            ...(options.onlyProjectId
              ? { projectId: options.onlyProjectId }
              : {}),
            version: candidate.version,
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
        });

        if (result.count !== 1) {
          return false;
        }

        // If queue insertion fails, the transaction
        // rolls back and restores the media record.
        await enqueueMediaObjectCleanup(
          tx,
          [candidate],
          {
            notBefore: cleanupNotBefore,
          },
        );

        return true;
      },
    );

    if (didRemove) {
      removed += 1;
    } else {
      skipped += 1;
    }
  }

  return {
    examined: candidates.length,
    removed,
    skipped,
  };
}

// ---------------------------------------------------------
// Periodic maintenance worker
// ---------------------------------------------------------

/**
 * Start periodic cleanup of expired upload metadata.
 *
 * Never return storage keys or user identifiers in logs.
 * Actual object deletion remains the responsibility of
 * the existing durable storage-deletion worker.
 */
export function startMediaReconciliationWorker():
  () => Promise<void> {
  let stopped = false;
  let active: Promise<void> | null = null;

  function tick(): void {
    if (stopped || active) {
      return;
    }

    active = (async () => {
      const result =
        await reconcileAbandonedProjectMedia();

      if (result.removed > 0) {
        console.info(
          'Expired media reconciled.',
          {
            removed: result.removed,
          },
        );
      }
    })()
      .catch((error: unknown) => {
        console.error(
          'Media reconciliation failed:',
          error instanceof Error
            ? error.name
            : 'UnknownError',
        );
      })
      .finally(() => {
        active = null;
      });
  }

  const timer = setInterval(
    tick,
    WORKER_INTERVAL_MS,
  );

  timer.unref();

  // Recover eligible records after an application restart.
  tick();

  return async () => {
    stopped = true;
    clearInterval(timer);
    await active;
  };
}
