import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { prisma } from '../src/database/prisma.js';
import {reconcileAbandonedProjectMedia} from '../src/modules/freelancer/project-media.reconciliation.js';

// ---------------------------------------------------------
// Safety: local test database only.
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
    'Media reconciliation tests require a local database.',
  );
}

const suffix = randomUUID().replace(/-/g, '');

let userId: string | null = null;
let projectId = '';

const createdKeys: string[] = [];

const oldDate = new Date(
  Date.now() - 2 * 60 * 60_000,
);

const recentDate = new Date();

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------

function createKeys() {
  const source =
    `projects/${projectId}/${randomUUID()}.png`;

  const preview =
    `projects/${projectId}/previews/` +
    `${randomUUID()}.webp`;

  createdKeys.push(source, preview);

  return {
    storageKey: source,
    previewKey: preview,
  };
}

async function createImage(
  filename: string,
  status: 'PENDING' | 'FAILED' | 'READY',
  createdAt: Date,
  updatedAt: Date,
) {
  return prisma.projectMedia.create({
    data: {
      projectId,
      ...createKeys(),

      originalFilename: filename,
      mimeType: 'image/png',
      fileSizeBytes: 1024,

      kind: 'IMAGE',
      status,

      createdAt,
      updatedAt,

      ...(status === 'READY'
        ? { readyAt: createdAt }
        : {}),
    },
  });
}

async function remainingMedia() {
  return prisma.projectMedia.findMany({
    where: { projectId },
    select: {
      originalFilename: true,
      status: true,
    },
    orderBy: {
      originalFilename: 'asc',
    },
  });
}

// ---------------------------------------------------------
// Delete only records created by this test.
// No R2 network operations are performed.
// ---------------------------------------------------------

after(async () => {
  try {
    await prisma.storageDeletionJob.deleteMany({
      where: {
        objectKey: {
          in: createdKeys,
        },
      },
    });

    if (userId) {
      await prisma.user.delete({
        where: { id: userId },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
});

// ---------------------------------------------------------
// Tests
// ---------------------------------------------------------

test('Abandoned project-media reconciliation', async (t) => {
  await t.test('creates isolated records', async () => {
    const user = await prisma.user.create({
      data: {
        email: `reconcile-${suffix}@example.com`,

        freelancerProfile: {
          create: {
            username: `reconcile_${suffix.slice(0, 12)}`,
            headline: 'Media Reconciliation Test',
            status: 'PUBLISHED',
            publishedAt: new Date(),
            onboardingCompletedAt: new Date(),
          },
        },
      },
      include: {
        freelancerProfile: true,
      },
    });

    userId = user.id;
    assert.ok(user.freelancerProfile);

    const project = await prisma.portfolioProject.create({
      data: {
        profileId: user.freelancerProfile.id,
        slug: 'reconciliation-project',
        title: 'Reconciliation Project',
      },
    });

    projectId = project.id;

    await createImage(
      'stale-pending.png',
      'PENDING',
      oldDate,
      oldDate,
    );

    await createImage(
      'stale-failed.png',
      'FAILED',
      oldDate,
      oldDate,
    );

    await createImage(
      'old-ready.png',
      'READY',
      oldDate,
      oldDate,
    );

    await createImage(
      'new-pending.png',
      'PENDING',
      recentDate,
      recentDate,
    );

    // Created long ago but touched recently:
    // reconciliation must leave it alone.
    await createImage(
      'recently-updated.png',
      'PENDING',
      oldDate,
      recentDate,
    );

    assert.equal(
      await prisma.projectMedia.count({
        where: { projectId },
      }),
      5,
    );
  });

  await t.test('rejects unsafe batch sizes', async () => {
    await assert.rejects(
      () => reconcileAbandonedProjectMedia(
        0,
        { onlyProjectId: projectId },
      ),
      RangeError,
    );

    await assert.rejects(
      () => reconcileAbandonedProjectMedia(
        1000,
        { onlyProjectId: projectId },
      ),
      RangeError,
    );
  });

  await t.test('removes only stale uploads', async () => {
    const result =
      await reconcileAbandonedProjectMedia(
        25,
        { onlyProjectId: projectId },
      );

    assert.deepEqual(result, {
      examined: 2,
      removed: 2,
      skipped: 0,
    });

    const remaining = await remainingMedia();

    assert.deepEqual(
      remaining.map((item) => item.originalFilename),
      [
        'new-pending.png',
        'old-ready.png',
        'recently-updated.png',
      ],
    );
  });

  await t.test('queues original files and previews', async () => {
    const jobs =
      await prisma.storageDeletionJob.findMany({
        where: {
          objectKey: {
            in: createdKeys,
          },
        },
        select: {
          objectKey: true,
          nextAttemptAt: true,
          attempts: true,
        },
      });

    assert.equal(jobs.length, 4);

    const earliestExpected =
      Date.now() + 25 * 60_000;

    for (const job of jobs) {
      assert.ok(
        job.nextAttemptAt.getTime() >
          earliestExpected,
      );

      assert.equal(job.attempts, 0);
    }
  });

  await t.test('is idempotent on repeated runs', async () => {
    const result =
      await reconcileAbandonedProjectMedia(
        25,
        { onlyProjectId: projectId },
      );

    assert.deepEqual(result, {
      examined: 0,
      removed: 0,
      skipped: 0,
    });

    const jobs =
      await prisma.storageDeletionJob.count({
        where: {
          objectKey: {
            in: createdKeys,
          },
        },
      });

    assert.equal(jobs, 4);
  });

  await t.test('preserves publication state', async () => {
    assert.ok(userId);

    const profile =
      await prisma.freelancerProfile.findUniqueOrThrow({
        where: { userId },
        select: {
          status: true,
          publishedAt: true,
          onboardingCompletedAt: true,
        },
      });

    assert.equal(profile.status, 'PUBLISHED');
    assert.ok(profile.publishedAt);
    assert.ok(profile.onboardingCompletedAt);
  });
});
