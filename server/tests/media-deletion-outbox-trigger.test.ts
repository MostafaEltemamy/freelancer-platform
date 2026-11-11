import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {after, test} from 'node:test';
import {prisma} from '../src/database/prisma.js';
import type {Prisma} from '../src/generated/prisma/client.js';

after(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------
// Local development database only.
// Never execute against production.
// ---------------------------------------------------------

const databaseUrl = process.env.DATABASE_URL;

if (
  process.env.NODE_ENV === 'production' ||
  !databaseUrl ||
  !['localhost', '127.0.0.1'].includes(
    new URL(databaseUrl).hostname,
  )
) {
  throw new Error(
    'Trigger tests require a local development database.',
  );
}

const ROLLBACK = 'ROLLBACK_MEDIA_TRIGGER_TEST';

interface Fixture {
  userId: string;
  projectId: string;
  mediaId: string;
  keys: string[];
}

async function createFixture(
  tx: Prisma.TransactionClient,
): Promise<Fixture> {
  const suffix = randomUUID().replace(/-/g, '');

  const user = await tx.user.create({
    data: {
      email:
        `trigger-${suffix}@example.com`,

      freelancerProfile: {
        create: {
          username: `trigger_${suffix.slice(0, 12)}`,
          headline: 'Database Trigger Test',
        },
      },
    },
    include: {
      freelancerProfile: true,
    },
  });

  assert.ok(user.freelancerProfile);

  const project = await tx.portfolioProject.create({
    data: {
      profileId: user.freelancerProfile.id,
      slug: 'trigger-test',
      title: 'Trigger Test Project',
    },
  });

  const storageKey =
    `projects/${project.id}/${randomUUID()}.png`;

  const previewKey =
    `projects/${project.id}/previews/` +
    `${randomUUID()}.webp`;

  const media = await tx.projectMedia.create({
    data: {
      projectId: project.id,
      storageKey,
      previewKey,
      originalFilename: 'test.png',
      mimeType: 'image/png',
      fileSizeBytes: 1024,
      kind: 'IMAGE',
      status: 'PENDING',
    },
  });

  return {
    userId: user.id,
    projectId: project.id,
    mediaId: media.id,
    keys: [storageKey, previewKey],
  };
}

async function assertCleanupJobs(
  tx: Prisma.TransactionClient,
  keys: string[],
): Promise<void> {
  const jobs = await tx.storageDeletionJob.findMany({
    where: {
      objectKey: { in: keys },
    },
    select: {
      objectKey: true,
      phase: true,
      nextAttemptAt: true,
    },
  });

  assert.equal(jobs.length, keys.length);

  assert.deepEqual(
    new Set(jobs.map((job) => job.objectKey)),
    new Set(keys),
  );

  for (const job of jobs) {
    assert.equal(job.phase, 'DELETE');

    assert.ok(
      job.nextAttemptAt.getTime() >
        Date.now() + 25 * 60_000,
    );
  }
}

/**
 * Always roll back fixture creation and deletion.
 *
 * A failed assertion also rolls back the transaction.
 */
async function rollbackScenario(
  check: (
    tx: Prisma.TransactionClient,
  ) => Promise<void>,
): Promise<void> {
  await assert.rejects(
    prisma.$transaction(
      async (tx) => {
        await check(tx);

        throw new Error(ROLLBACK);
      },
      {
        maxWait: 5000,
        timeout: 20000,
      },
    ),
    (error: unknown) =>
      error instanceof Error &&
      error.message === ROLLBACK,
  );
}

test('direct media deletion queues both objects', async () => {
  await rollbackScenario(async (tx) => {
    const f = await createFixture(tx);

    await tx.projectMedia.delete({
      where: { id: f.mediaId },
    });

    await assertCleanupJobs(tx, f.keys);
  });
});

test('project cascade queues media objects', async () => {
  await rollbackScenario(async (tx) => {
    const f = await createFixture(tx);

    await tx.portfolioProject.delete({
      where: { id: f.projectId },
    });

    assert.equal(
      await tx.projectMedia.count({
        where: { projectId: f.projectId },
      }),
      0,
    );

    await assertCleanupJobs(tx, f.keys);
  });
});

test('account cascade queues media objects', async () => {
  await rollbackScenario(async (tx) => {
    const f = await createFixture(tx);

    await tx.user.delete({
      where: { id: f.userId },
    });

    assert.equal(
      await tx.projectMedia.count({
        where: { projectId: f.projectId },
      }),
      0,
    );

    await assertCleanupJobs(tx, f.keys);
  });
});

test('existing jobs are not duplicated', async () => {
  await rollbackScenario(async (tx) => {
    const f = await createFixture(tx);

    // Simulate the application enqueuing cleanup
    // before the database deletion.
    await tx.storageDeletionJob.createMany({
      data: f.keys.map((objectKey) => ({
        objectKey,
        nextAttemptAt: new Date(
          Date.now() + 30 * 60_000,
        ),
      })),
    });

    await tx.projectMedia.delete({
      where: { id: f.mediaId },
    });

    await assertCleanupJobs(tx, f.keys);
  });
});

test('deleted fixtures do not escape the rollback', async () => {
  let keys: string[] = [];

  await rollbackScenario(async (tx) => {
    const f = await createFixture(tx);
    keys = f.keys;

    await tx.projectMedia.delete({
      where: { id: f.mediaId },
    });

    await assertCleanupJobs(tx, keys);
  });

  assert.equal(
    await prisma.storageDeletionJob.count({
      where: {
        objectKey: { in: keys },
      },
    }),
    0,
  );
});