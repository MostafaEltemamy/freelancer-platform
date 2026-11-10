export class StorageOperationDeadlineError extends Error {
  constructor() {
    super('Storage operation exceeded its deadline.');
    this.name = 'StorageOperationDeadlineError';
  }
}

/**
 * Bounds how long the application awaits an operation.
 *
 * Aborting is best-effort: it does NOT prove that the
 * remote storage provider cancelled an in-flight PUT.
 */
export async function withAbortDeadline<T>(
  durationMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (
    !Number.isSafeInteger(durationMs) ||
    durationMs < 1 ||
    durationMs > 300_000
  ) {
    throw new RangeError('Invalid storage deadline.');
  }

  const controller = new AbortController();

  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      // Settle the timeout first, so a synchronous abort
      // rejection does not obscure the deadline error.
      reject(new StorageOperationDeadlineError());
      controller.abort();
    }, durationMs);
  });

  try {
    return await Promise.race([
      Promise.resolve().then(() =>
        operation(controller.signal),
      ),
      deadline,
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}