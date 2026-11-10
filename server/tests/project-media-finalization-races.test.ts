import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {after, test} from 'node:test';
import {prisma} from '../src/database/prisma.js';
import {finalizeProjectImageUpload, listMyProjectMedia, MediaProjectNotFoundError, MediaStateConflictError} from '../src/modules/freelancer/project-media.service.js';
import type {ImageFinalizationIO} from '../src/modules/freelancer/project-media.service.js';
import {MediaStorageError, MediaUploadInvalidError, MediaUploadMissingError, MediaStorageTimeoutError} from '../src/modules/freelancer/project-media.storage.js';
import {deleteMyProject} from '../src/modules/freelancer/project.service.js';
import {reconcileAbandonedProjectMedia} from '../src/modules/freelancer/project-media.reconciliation.js';

// ---------------------------------------------------------
// Database-only tests. R2 operations are mocked.
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
    'Finalization race tests require a local database.',
  );
}

const suffix = randomUUID().replace(/-/g, '');

const userIds: string[] = [];
const storageKeys: string[] = [];

interface Fixture {
  userId: string;
  projectId: string;
  mediaId: string;
  sourceKey: string;
  previewKey: string;
}

async function createFixture(
  status: 'PENDING' | 'FINALIZING' = 'PENDING',
  old = false,
): Promise<Fixture> {
  const number = userIds.length;
  const user = await prisma.user.create({
    data: {
      email:
        `finalization-${suffix}-${number}@example.com`,
      freelancerProfile: {
        create: {
          username:
            `fin_${suffix.slice(0, 12)}_${number}`,
          headline: 'Finalization Test',
        },
      },
    },
    include: {
      freelancerProfile: true,
    },
  });

  userIds.push(user.id);

  assert.ok(user.freelancerProfile);

  const project = await prisma.portfolioProject.create({
    data: {
      profileId: user.freelancerProfile.id,
      slug: 'finalization-test',
      title: 'Finalization Test',
    },
  });

  const sourceKey =
    `projects/${project.id}/${randomUUID()}.png`;

  const previewKey =
    `projects/${project.id}/previews/` +
    `${randomUUID()}.webp`;

  storageKeys.push(sourceKey, previewKey);

  const oldDate = new Date(
    Date.now() - 2 * 60 * 60_000,
  );

  const media = await prisma.projectMedia.create({
    data: {
      projectId: project.id,
      storageKey: sourceKey,
      previewKey,
      originalFilename: 'test.png',
      mimeType: 'image/png',
      fileSizeBytes: 1024,
      kind: 'IMAGE',
      status,
      ...(old
        ? {
            createdAt: oldDate,
            updatedAt: oldDate,
          }
        : {}),
    },
  });

  return {
    userId: user.id,
    projectId: project.id,
    mediaId: media.id,
    sourceKey,
    previewKey,
  };
}

const goodIO: ImageFinalizationIO = {
  async readUploadedImage() {
    return Buffer.from('simulated-image');
  },

  async processProjectImage() {
    return {
      buffer: Buffer.from('simulated-webp'),
      width: 320,
      height: 180,
      mimeType: 'image/webp',
    };
  },

  async writeImagePreview() {
    // No external storage write.
  },
};

function barrier() {
  let signal!: () => void;
  let release!: () => void;

  const entered = new Promise<void>((resolve) => {
    signal = resolve;
  });

  const resume = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { entered, resume, signal, release };
}

async function jobsFor(f: Fixture) {
  return prisma.storageDeletionJob.findMany({
    where: {
      objectKey: {
        in: [f.sourceKey, f.previewKey],
      },
    },
    select: { objectKey: true },
  });
}

after(async () => {
  try {
    await prisma.storageDeletionJob.deleteMany({
      where: {
        objectKey: { in: storageKeys },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: { in: userIds },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});

// ---------------------------------------------------------
// 1. Only one concurrent completion can succeed.
// ---------------------------------------------------------

test('only one finalizer can claim an image', async () => {
  const f = await createFixture();
  const gate = barrier();
  let writes = 0;

  const io: ImageFinalizationIO = {
    ...goodIO,

    async readUploadedImage() {
      gate.signal();
      await gate.resume;
      return Buffer.from('simulated-image');
    },

    async writeImagePreview() {
      writes++;
    },
  };

  const first = finalizeProjectImageUpload(
    f.userId, f.projectId, f.mediaId, io,
  );

  try {
    await gate.entered;

    const claimed =
      await prisma.projectMedia.findUniqueOrThrow({
        where: { id: f.mediaId },
      });

    assert.equal(claimed.status, 'FINALIZING');

    const visible = await listMyProjectMedia(
      f.userId,
      f.projectId,
    );

    assert.equal(visible[0]?.status, 'PENDING');

    await assert.rejects(
      () => finalizeProjectImageUpload(
        f.userId, f.projectId, f.mediaId, io,
      ),
      MediaStateConflictError,
    );
  } finally {
    gate.release();
  }

  const ready = await first;

  assert.equal(ready.status, 'READY');
  assert.equal(ready.version, 2);
  assert.equal(writes, 1);
});

// ---------------------------------------------------------
// 2. Missing uploads can retry.
// ---------------------------------------------------------

test('missing upload returns to PENDING', async () => {
  const f = await createFixture();

  await assert.rejects(
    () => finalizeProjectImageUpload(
      f.userId,
      f.projectId,
      f.mediaId,
      {
        ...goodIO,
        async readUploadedImage() {
          throw new MediaUploadMissingError();
        },
      },
    ),
    MediaUploadMissingError,
  );

  const pending =
    await prisma.projectMedia.findUniqueOrThrow({
      where: { id: f.mediaId },
    });

  assert.equal(pending.status, 'PENDING');
  assert.equal(pending.version, 1);

  const ready = await finalizeProjectImageUpload(
    f.userId, f.projectId, f.mediaId, goodIO,
  );

  assert.equal(ready.status, 'READY');
  assert.equal(ready.version, 2);
});

// ---------------------------------------------------------
// 3. Invalid image bytes become FAILED.
// ---------------------------------------------------------

test('invalid image becomes FAILED', async () => {
  const f = await createFixture();

  await assert.rejects(
    () => finalizeProjectImageUpload(
      f.userId,
      f.projectId,
      f.mediaId,
      {
        ...goodIO,
        async processProjectImage() {
          throw new MediaUploadInvalidError();
        },
      },
    ),
    MediaUploadInvalidError,
  );

  const record =
    await prisma.projectMedia.findUniqueOrThrow({
      where: { id: f.mediaId },
    });

  assert.equal(record.status, 'FAILED');
  assert.equal(record.version, 1);
});

// ---------------------------------------------------------
// 4. Transient storage errors remain retryable.
// ---------------------------------------------------------

test('storage failure releases the claim', async () => {
  const f = await createFixture();

  await assert.rejects(
    () => finalizeProjectImageUpload(
      f.userId,
      f.projectId,
      f.mediaId,
      {
        ...goodIO,
        async readUploadedImage() {
          throw new MediaStorageError();
        },
      },
    ),
    MediaStorageError,
  );

  const record =
    await prisma.projectMedia.findUniqueOrThrow({
      where: { id: f.mediaId },
    });

  assert.equal(record.status, 'PENDING');

  const ready = await finalizeProjectImageUpload(
    f.userId, f.projectId, f.mediaId, goodIO,
  );

  assert.equal(ready.status, 'READY');
});

// ---------------------------------------------------------
// 5. Deletion during processing stops the preview write.
// ---------------------------------------------------------

test('project deletion prevents a later preview write', async () => {
  const f = await createFixture();
  const gate = barrier();
  let writes = 0;

  const io: ImageFinalizationIO = {
    ...goodIO,

    async readUploadedImage() {
      gate.signal();
      await gate.resume;
      return Buffer.from('simulated-image');
    },

    async writeImagePreview() {
      writes++;
    },
  };

  const completion = finalizeProjectImageUpload(
    f.userId, f.projectId, f.mediaId, io,
  );

  try {
    await gate.entered;

    await deleteMyProject(
      f.userId,
      f.projectId,
      1,
    );
  } finally {
    gate.release();
  }

  await assert.rejects(
    completion,
    MediaStateConflictError,
  );

  assert.equal(writes, 0);
  assert.equal((await jobsFor(f)).length, 2);
});

// ---------------------------------------------------------
// 6. A deletion during an R2 write cannot resurrect media.
// ---------------------------------------------------------

test('late preview completion cannot resurrect a project', async () => {
  const f = await createFixture();
  const gate = barrier();

  const io: ImageFinalizationIO = {
    ...goodIO,

    async writeImagePreview() {
      gate.signal();
      await gate.resume;
    },
  };

  const completion = finalizeProjectImageUpload(
    f.userId, f.projectId, f.mediaId, io,
  );

  try {
    await gate.entered;

    await deleteMyProject(
      f.userId,
      f.projectId,
      1,
    );
  } finally {
    gate.release();
  }

  await assert.rejects(
    completion,
    MediaProjectNotFoundError,
  );

  assert.equal(
    await prisma.projectMedia.findUnique({
      where: { id: f.mediaId },
    }),
    null,
  );

  assert.equal((await jobsFor(f)).length, 2);
});

// ---------------------------------------------------------
// 7. Crashed finalizations can be reconciled.
// ---------------------------------------------------------

test('stale FINALIZING records are cleaned up', async () => {
  const f = await createFixture(
    'FINALIZING',
    true,
  );

  const result =
    await reconcileAbandonedProjectMedia(
      25,
      { onlyProjectId: f.projectId },
    );

  assert.deepEqual(result, {
    examined: 1,
    removed: 1,
    skipped: 0,
  });

  assert.equal(
    await prisma.projectMedia.findUnique({
      where: { id: f.mediaId },
    }),
    null,
  );

  assert.equal((await jobsFor(f)).length, 2);
});

test('ambiguous preview write remains FINALIZING', async () => {
  const f = await createFixture();

  await assert.rejects(
    () =>
      finalizeProjectImageUpload(
        f.userId,
        f.projectId,
        f.mediaId,
        {
          ...goodIO,

          async writeImagePreview() {
            throw new MediaStorageError(
              'Simulated uncertain PUT result.',
            );
          },
        },
      ),
    MediaStorageError,
  );

  const record =
    await prisma.projectMedia.findUniqueOrThrow({
      where: { id: f.mediaId },
    });

  assert.equal(record.status, 'FINALIZING');
  assert.equal(record.version, 1);
});

test('timed-out storage read remains FINALIZING', async () => {
  const f = await createFixture();

  await assert.rejects(
    () =>
      finalizeProjectImageUpload(
        f.userId,
        f.projectId,
        f.mediaId,
        {
          ...goodIO,

          async readUploadedImage() {
            throw new MediaStorageTimeoutError();
          },
        },
      ),
    MediaStorageTimeoutError,
  );

  const record =
    await prisma.projectMedia.findUniqueOrThrow({
      where: { id: f.mediaId },
    });

  assert.equal(record.status, 'FINALIZING');
  assert.equal(record.version, 1);
});