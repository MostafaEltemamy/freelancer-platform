import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { prisma } from '../src/database/prisma.js';
import {generateSessionToken} from '../src/modules/auth/session-tokens.js';
import {SESSION_COOKIE_NAME} from '../src/modules/auth/session-cookie.js';

// ---------------------------------------------------------
// Safety checks
// ---------------------------------------------------------

const BASE =
  process.env.TEST_API_BASE_URL ??
  'http://localhost:5001';

const databaseUrl = process.env.DATABASE_URL;

if (
  process.env.NODE_ENV === 'production' ||
  !databaseUrl ||
  !['localhost', '127.0.0.1'].includes(
    new URL(databaseUrl).hostname,
  ) ||
  !['localhost', '127.0.0.1'].includes(
    new URL(BASE).hostname,
  )
) {
  throw new Error(
    'Deletion tests require a local API and database.',
  );
}

interface TestSession {
  userId: string;
  cookie: string;
  csrfToken: string;
}

const unique = randomUUID().replace(/-/g, '');

const createdUserIds: string[] = [];
const createdObjectKeys: string[] = [];

let owner!: TestSession;
let other!: TestSession;

let projectId = '';
let projectVersion = 1;

let coverId = '';
let pendingId = '';
let remainingId = '';

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------

function sourceKey(projectIdValue: string): string {
  const key =
    `projects/${projectIdValue}/${randomUUID()}.png`;

  createdObjectKeys.push(key);

  return key;
}

function previewKey(projectIdValue: string): string {
  const key =
    `projects/${projectIdValue}/previews/` +
    `${randomUUID()}.webp`;

  createdObjectKeys.push(key);

  return key;
}

async function createAccount(
  name: string,
): Promise<TestSession> {
  const user = await prisma.user.create({
    data: {
      email:
        `deletion-${name}-${unique}@example.com`,

      freelancerProfile: {
        create: {
          username:
            `delete_${name}_${unique.slice(0, 8)}`,
          headline: 'Professional Freelancer',
        },
      },
    },
  });

  createdUserIds.push(user.id);

  const { token, tokenHash } =
    generateSessionToken();

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(
        Date.now() + 60 * 60_000,
      ),
    },
  });

  const cookie =
    `${SESSION_COOKIE_NAME}=${token}`;

  const csrfResponse = await fetch(
    `${BASE}/api/auth/csrf`,
    {
      headers: {
        Cookie: cookie,
      },
    },
  );

  assert.equal(csrfResponse.status, 200);

  const result = await csrfResponse.json() as {
    csrfToken: string;
  };

  return {
    userId: user.id,
    cookie,
    csrfToken: result.csrfToken,
  };
}

function imagePath(mediaId: string): string {
  return (
    `/api/freelancer/projects/${projectId}` +
    `/media/${mediaId}`
  );
}

function request(
  path: string,
  session: TestSession | null,
  body: unknown,
  withCsrf = true,
): Promise<Response> {
  const headers = new Headers({
    Origin: new URL(BASE).origin,
    'Content-Type': 'application/json',
  });

  if (session) {
    headers.set(
      'Cookie',
      session.cookie,
    );

    if (withCsrf) {
      headers.set(
        'X-CSRF-Token',
        session.csrfToken,
      );
    }
  }

  return fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify(body),
  });
}

async function queuedKeys() {
  return prisma.storageDeletionJob.findMany({
    where: {
      objectKey: {
        in: createdObjectKeys,
      },
    },
    select: {
      objectKey: true,
      nextAttemptAt: true,
    },
  });
}

// ---------------------------------------------------------
// Cleanup
//
// Only the test's own objects and records are removed.
// No R2 operations occur in this suite.
// ---------------------------------------------------------

after(async () => {
  try {
    if (createdObjectKeys.length > 0) {
      await prisma.storageDeletionJob.deleteMany({
        where: {
          objectKey: {
            in: createdObjectKeys,
          },
        },
      });
    }

    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: createdUserIds,
          },
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
});

// ---------------------------------------------------------
// Tests
// ---------------------------------------------------------

test('Project image deletion and durable cleanup', async (t) => {
  await t.test('creates isolated test data', async () => {
    owner = await createAccount('owner');
    other = await createAccount('other');

    const profile =
      await prisma.freelancerProfile.findUniqueOrThrow({
        where: {
          userId: owner.userId,
        },
      });

    const project =
      await prisma.portfolioProject.create({
        data: {
          profileId: profile.id,
          slug: 'gallery-removal',
          title: 'Gallery Removal Test',
        },
      });

    projectId = project.id;
    projectVersion = project.version;

    const cover = await prisma.projectMedia.create({
      data: {
        projectId,
        storageKey: sourceKey(projectId),
        previewKey: previewKey(projectId),
        originalFilename: 'cover.png',
        mimeType: 'image/png',
        fileSizeBytes: 1024,
        kind: 'IMAGE',
        status: 'READY',
        isCover: true,
        readyAt: new Date(),
      },
    });

    coverId = cover.id;

    const pending =
      await prisma.projectMedia.create({
        data: {
          projectId,
          storageKey: sourceKey(projectId),
          previewKey: previewKey(projectId),
          originalFilename: 'pending.png',
          mimeType: 'image/png',
          fileSizeBytes: 1024,
          kind: 'IMAGE',
          status: 'PENDING',
        },
      });

    pendingId = pending.id;

    const remaining =
      await prisma.projectMedia.create({
        data: {
          projectId,
          storageKey: sourceKey(projectId),
          previewKey: previewKey(projectId),
          originalFilename: 'remaining.png',
          mimeType: 'image/png',
          fileSizeBytes: 1024,
          kind: 'IMAGE',
          status: 'READY',
          readyAt: new Date(),
        },
      });

    remainingId = remaining.id;

    assert.equal(
      await prisma.projectMedia.count({
        where: { projectId },
      }),
      3,
    );
  });

  await t.test('requires authentication', async () => {
    const response = await request(
      imagePath(coverId),
      null,
      { version: 1 },
    );

    assert.equal(response.status, 401);
  });

  await t.test('requires CSRF protection', async () => {
    const response = await request(
      imagePath(coverId),
      owner,
      { version: 1 },
      false,
    );

    assert.equal(response.status, 403);
  });

  await t.test('rejects another freelancer', async () => {
    const response = await request(
      imagePath(coverId),
      other,
      { version: 1 },
    );

    assert.equal(response.status, 404);
  });

  await t.test('requires a record version', async () => {
    const response = await request(
      imagePath(coverId),
      owner,
      {},
    );

    assert.equal(response.status, 400);
  });

  await t.test('rejects stale deletion without creating jobs', async () => {
    const response = await request(
      imagePath(coverId),
      owner,
      { version: 2 },
    );

    assert.equal(response.status, 409);

    const data = await response.json() as {
      code?: string;
    };

    assert.equal(
      data.code,
      'STALE_MEDIA_VERSION',
    );

    assert.equal(
      (await queuedKeys()).length,
      0,
    );

    assert.ok(
      await prisma.projectMedia.findUnique({
        where: { id: coverId },
      }),
    );
  });

  await t.test('blocks deletion of published media', async () => {
    await prisma.freelancerProfile.update({
      where: {
        userId: owner.userId,
      },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        onboardingCompletedAt: new Date(),
      },
    });

    const response = await request(
      imagePath(coverId),
      owner,
      { version: 1 },
    );

    assert.equal(response.status, 409);

    await prisma.freelancerProfile.update({
      where: {
        userId: owner.userId,
      },
      data: {
        status: 'DRAFT',
        publishedAt: null,
      },
    });
  });

  await t.test('removes the cover and queues two objects', async () => {
    const response = await request(
      imagePath(coverId),
      owner,
      { version: 1 },
    );

    assert.equal(response.status, 200);

    const result = await response.json() as {
      deleted: { id: string };
    };

    assert.equal(result.deleted.id, coverId);

    assert.equal(
      await prisma.projectMedia.findUnique({
        where: { id: coverId },
      }),
      null,
    );

    assert.equal(
      await prisma.projectMedia.count({
        where: {
          projectId,
          isCover: true,
        },
      }),
      0,
    );

    const jobs = await queuedKeys();

    assert.equal(jobs.length, 2);

    // The worker must not delete a recently created
    // object before its upload safety window ends.
    const minimumDelay =
      Date.now() + 25 * 60_000;

    for (const job of jobs) {
      assert.ok(
        job.nextAttemptAt.getTime() >
        minimumDelay,
      );
    }
  });

  await t.test('also permits pending upload removal', async () => {
    const response = await request(
      imagePath(pendingId),
      owner,
      { version: 1 },
    );

    assert.equal(response.status, 200);

    assert.equal(
      await prisma.projectMedia.findUnique({
        where: { id: pendingId },
      }),
      null,
    );

    assert.equal(
      (await queuedKeys()).length,
      4,
    );
  });

  await t.test('deleting an entire project also queues its media', async () => {
    const response = await request(
      `/api/freelancer/projects/${projectId}`,
      owner,
      {
        version: projectVersion,
      },
    );

    assert.equal(response.status, 204);

    assert.equal(
      await prisma.portfolioProject.findUnique({
        where: { id: projectId },
      }),
      null,
    );

    assert.equal(
      await prisma.projectMedia.findUnique({
        where: { id: remainingId },
      }),
      null,
    );

    // Three images with original and preview each.
    // Two were deleted individually, one via the project.
    assert.equal(
      (await queuedKeys()).length,
      6,
    );
  });

  await t.test('does not allow repeated deletion of missing media', async () => {
    const response = await request(
      imagePath(coverId),
      owner,
      { version: 1 },
    );

    assert.equal(response.status, 404);

    assert.equal(
      (await queuedKeys()).length,
      6,
    );
  });
});
