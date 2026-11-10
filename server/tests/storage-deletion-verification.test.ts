import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {after, test} from 'node:test';
import {prisma} from '../src/database/prisma.js';
import {processStorageDeletionBatch} from '../src/modules/freelancer/storage-deletion.queue.js';

const databaseUrl = process.env.DATABASE_URL;

if (
  process.env.NODE_ENV === 'production' ||
  !databaseUrl ||
  !['localhost', '127.0.0.1'].includes(
    new URL(databaseUrl).hostname,
  )
) {
  throw new Error(
    'Verification tests require a local database.',
  );
}

const createdJobIds: string[] = [];

async function createJob() {
  const projectId = randomUUID();
  const objectId = randomUUID();

  const job = await prisma.storageDeletionJob.create({
    data: {
      objectKey:
        `projects/${projectId}/${objectId}.png`,

      nextAttemptAt: new Date(
        Date.now() - 1_000,
      ),
    },
  });

  createdJobIds.push(job.id);

  return job;
}

async function makeDue(id: string) {
  await prisma.storageDeletionJob.update({
    where: { id },
    data: {
      nextAttemptAt: new Date(
        Date.now() - 1_000,
      ),
    },
  });
}

async function readJob(id: string) {
  return prisma.storageDeletionJob.findUnique({
    where: { id },
  });
}

after(async () => {
  try {
    await prisma.storageDeletionJob.deleteMany({
      where: {
        id: { in: createdJobIds },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});

test('DELETE is retained for two verification passes', async () => {
  const job = await createJob();

  let removals = 0;
  let checks = 0;

  const run = () =>
    processStorageDeletionBatch(1, {
      onlyJobId: job.id,

      async removeObject() {
        removals++;
      },

      async objectExists() {
        checks++;
        return false;
      },
    });

  // First DELETE.
  assert.deepEqual(await run(), {
    claimed: 1,
    deleted: 1,
    failed: 0,
  });

  let stored = await readJob(job.id);

  assert.equal(stored?.phase, 'VERIFY');
  assert.equal(stored?.verificationPasses, 0);
  assert.equal(removals, 1);
  assert.equal(checks, 0);

  assert.ok(
    stored!.nextAttemptAt.getTime() >
    Date.now() + 4 * 60_000,
  );

  // First delayed verification.
  await makeDue(job.id);
  await run();

  stored = await readJob(job.id);

  assert.equal(stored?.phase, 'VERIFY');
  assert.equal(stored?.verificationPasses, 1);
  assert.equal(checks, 1);

  assert.ok(
    stored!.nextAttemptAt.getTime() >
    Date.now() + 29 * 60_000,
  );

  // Second delayed verification completes cleanup.
  await makeDue(job.id);
  await run();

  assert.equal(await readJob(job.id), null);
  assert.equal(removals, 1);
  assert.equal(checks, 2);
});

test('a reappearing object returns to DELETE', async () => {
  const job = await createJob();

  let exists = false;
  let removals = 0;

  const run = () =>
    processStorageDeletionBatch(1, {
      onlyJobId: job.id,

      async removeObject() {
        removals++;
        exists = false;
      },

      async objectExists() {
        return exists;
      },
    });

  // Initial delete and first successful check.
  await run();
  await makeDue(job.id);
  await run();

  assert.equal(
    (await readJob(job.id))?.verificationPasses,
    1,
  );

  // Simulate a late remote PUT restoring the object.
  exists = true;

  await makeDue(job.id);
  await run();

  let stored = await readJob(job.id);

  assert.equal(stored?.phase, 'DELETE');
  assert.equal(stored?.verificationPasses, 0);

  // Worker removes it again.
  await run();

  stored = await readJob(job.id);

  assert.equal(stored?.phase, 'VERIFY');
  assert.equal(removals, 2);

  // Both verification passes must be repeated.
  await makeDue(job.id);
  await run();

  await makeDue(job.id);
  await run();

  assert.equal(await readJob(job.id), null);
  assert.equal(removals, 2);
});

test('HEAD errors retain the job and retry', async () => {
  const job = await createJob();

  let failHead = true;

  const run = () =>
    processStorageDeletionBatch(1, {
      onlyJobId: job.id,

      async removeObject() {
        // Simulate successful DELETE.
      },

      async objectExists() {
        if (failHead) {
          const error = new Error(
            'Simulated storage access failure.',
          );
          error.name = 'AccessDenied';
          throw error;
        }

        return false;
      },
    });

  await run();
  await makeDue(job.id);

  const failed = await run();

  assert.deepEqual(failed, {
    claimed: 1,
    deleted: 0,
    failed: 1,
  });

  let stored = await readJob(job.id);

  assert.equal(stored?.phase, 'VERIFY');
  assert.equal(stored?.verificationPasses, 0);
  assert.equal(stored?.consecutiveFailures, 1);
  assert.equal(stored?.lastError, 'AccessDenied');

  // Recovery retains the same job.
  failHead = false;

  await makeDue(job.id);
  await run();

  stored = await readJob(job.id);

  assert.equal(stored?.phase, 'VERIFY');
  assert.equal(stored?.verificationPasses, 1);
  assert.equal(stored?.consecutiveFailures, 0);
  assert.equal(stored?.lastError, null);

  await makeDue(job.id);
  await run();

  assert.equal(await readJob(job.id), null);
});

test('concurrent workers cannot both claim a job', async () => {
  const job = await createJob();

  let enter!: () => void;
  let release!: () => void;

  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });

  const resume = new Promise<void>((resolve) => {
    release = resolve;
  });

  let removals = 0;

  const removeObject = async () => {
    removals++;
    enter();
    await resume;
  };

  const first = processStorageDeletionBatch(1, {
    onlyJobId: job.id,
    removeObject,
  });

  try {
    await entered;

    const second = await processStorageDeletionBatch(1, {
      onlyJobId: job.id,
      removeObject,
    });

    assert.equal(second.claimed, 0);
  } finally {
    release();
  }

  await first;

  assert.equal(removals, 1);
  assert.equal(
    (await readJob(job.id))?.phase,
    'VERIFY',
  );
});