import assert from 'node:assert/strict';
import { test } from 'node:test';
import {StorageOperationDeadlineError, withAbortDeadline} from '../src/modules/freelancer/media-storage.deadline.js';

test('returns a completed storage operation', async () => {
  const result = await withAbortDeadline(
    1_000,
    async (signal) => {
      assert.equal(signal.aborted, false);
      return 'completed';
    },
  );

  assert.equal(result, 'completed');
});

test('preserves an ordinary storage failure', async () => {
  await assert.rejects(
    () =>
      withAbortDeadline(
        1_000,
        async () => {
          throw new Error('SimulatedStorageFailure');
        },
      ),
    /SimulatedStorageFailure/,
  );
});

test('times out and requests cancellation', async () => {
  let abortObserved = false;

  await assert.rejects(
    () =>
      withAbortDeadline(
        30,
        (signal) =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                abortObserved = true;
                reject(new Error('Cancelled'));
              },
              { once: true },
            );
          }),
      ),
    StorageOperationDeadlineError,
  );

  assert.equal(abortObserved, true);
});

test('rejects invalid deadlines', async () => {
  for (const duration of [
    0,
    -1,
    300_001,
    Number.NaN,
  ]) {
    await assert.rejects(
      () =>
        withAbortDeadline(
          duration,
          async () => true,
        ),
      RangeError,
    );
  }
});
