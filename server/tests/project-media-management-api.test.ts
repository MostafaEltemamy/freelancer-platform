import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { prisma } from '../src/database/prisma.js';
import {generateSessionToken} from '../src/modules/auth/session-tokens.js';
import {SESSION_COOKIE_NAME} from '../src/modules/auth/session-cookie.js';

// ---------------------------------------------------------
// Safety: local API and database only.
// This suite creates metadata, NOT actual R2 objects.
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
    'Gallery tests require a local API and local database.',
  );
}

interface TestSession {
  userId: string;
  cookie: string;
  csrfToken: string;
}

const unique = randomUUID().replace(/-/g, '');

const createdUserIds: string[] = [];

let projectId = '';
let owner!: TestSession;
let other!: TestSession;

const readyIds: string[] = [];
let pendingId = '';

// ---------------------------------------------------------
// Test helpers
// ---------------------------------------------------------

async function createAccount(
  name: string,
): Promise<TestSession> {
  const user = await prisma.user.create({
    data: {
      email: `gallery-${name}-${unique}@example.com`,
      displayName: `Gallery Test ${name}`,

      freelancerProfile: {
        create: {
          username:
            `${name}_${unique.slice(0, 12)}`,
          headline: 'Creative Freelancer',
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

  const response = await fetch(
    `${BASE}/api/auth/csrf`,
    {
      headers: {
        Cookie: cookie,
      },
    },
  );

  assert.equal(response.status, 200);

  const data = await response.json() as {
    csrfToken: string;
  };

  return {
    userId: user.id,
    cookie,
    csrfToken: data.csrfToken,
  };
}

function request(
  method: 'PATCH' | 'PUT',
  path: string,
  session: TestSession | null,
  body: unknown,
  withCsrf = true,
): Promise<Response> {
  const headers = new Headers({
    'Content-Type': 'application/json',
    Origin: new URL(BASE).origin,
  });

  if (session) {
    headers.set('Cookie', session.cookie);

    if (withCsrf) {
      headers.set(
        'X-CSRF-Token',
        session.csrfToken,
      );
    }
  }

  return fetch(`${BASE}${path}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

function mediaPath(id: string): string {
  return (
    `/api/freelancer/projects/${projectId}` +
    `/media/${id}`
  );
}

function orderPath(): string {
  return (
    `/api/freelancer/projects/${projectId}/media/order`
  );
}

async function mediaVersion(
  id: string,
): Promise<number> {
  const record =
    await prisma.projectMedia.findUniqueOrThrow({
      where: { id },
      select: { version: true },
    });

  return record.version;
}

async function currentReadyOrder() {
  return prisma.projectMedia.findMany({
    where: {
      projectId,
      kind: 'IMAGE',
      status: 'READY',
    },
    select: {
      id: true,
      version: true,
      sortOrder: true,
    },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  });
}

// ---------------------------------------------------------
// Cleanup only data created by this suite.
// ---------------------------------------------------------

after(async () => {
  try {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: {
          id: { in: createdUserIds },
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
});

// ---------------------------------------------------------
// Integration tests
// ---------------------------------------------------------

test('Project gallery management API', async (t) => {
  await t.test('creates isolated gallery test data', async () => {
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
          slug: 'gallery-work',
          title: 'Portfolio Gallery Work',
        },
      });

    projectId = project.id;

    for (const [index, name] of [
      'alpha',
      'beta',
      'gamma',
    ].entries()) {
      const item = await prisma.projectMedia.create({
        data: {
          projectId,
          storageKey:
            `projects/${projectId}/${randomUUID()}.png`,
          originalFilename: `${name}.png`,
          mimeType: 'image/png',
          fileSizeBytes: 1024,
          kind: 'IMAGE',
          status: 'READY',
          readyAt: new Date(),
          sortOrder: index,
        },
      });

      readyIds.push(item.id);
    }

    const pending =
      await prisma.projectMedia.create({
        data: {
          projectId,
          storageKey:
            `projects/${projectId}/${randomUUID()}.png`,
          originalFilename: 'pending.png',
          mimeType: 'image/png',
          fileSizeBytes: 1024,
          kind: 'IMAGE',
          status: 'PENDING',
          sortOrder: 3,
        },
      });

    pendingId = pending.id;

    assert.equal(readyIds.length, 3);
  });

  await t.test('requires authentication', async () => {
    const response = await request(
      'PUT',
      `${mediaPath(readyIds[0]!)}/cover`,
      null,
      { version: 1 },
    );

    assert.equal(response.status, 401);
  });

  await t.test('requires a CSRF token', async () => {
    const response = await request(
      'PUT',
      `${mediaPath(readyIds[0]!)}/cover`,
      owner,
      { version: 1 },
      false,
    );

    assert.equal(response.status, 403);
  });

  await t.test('rejects another freelancer', async () => {
    const response = await request(
      'PUT',
      `${mediaPath(readyIds[0]!)}/cover`,
      other,
      { version: 1 },
    );

    assert.equal(response.status, 404);
  });

  await t.test('cannot make a pending upload the cover', async () => {
    const response = await request(
      'PUT',
      `${mediaPath(pendingId)}/cover`,
      owner,
      { version: 1 },
    );

    assert.equal(response.status, 409);
  });

  await t.test('selects the first verified cover', async () => {
    const response = await request(
      'PUT',
      `${mediaPath(readyIds[0]!)}/cover`,
      owner,
      { version: 1 },
    );

    assert.equal(response.status, 200);

    const cover =
      await prisma.projectMedia.findUniqueOrThrow({
        where: { id: readyIds[0]! },
      });

    assert.equal(cover.isCover, true);
    assert.equal(cover.version, 2);
  });

  await t.test('replaces the cover atomically', async () => {
    const response = await request(
      'PUT',
      `${mediaPath(readyIds[1]!)}/cover`,
      owner,
      { version: 1 },
    );

    assert.equal(response.status, 200);

    const covers = await prisma.projectMedia.findMany({
      where: {
        projectId,
        isCover: true,
      },
      select: { id: true },
    });

    assert.deepEqual(
      covers.map((item) => item.id),
      [readyIds[1]],
    );

    // The old cover's version also changes.
    assert.equal(
      await mediaVersion(readyIds[0]!),
      3,
    );

    assert.equal(
      await mediaVersion(readyIds[1]!),
      2,
    );
  });

  await t.test('rejects stale cover selection', async () => {
    const response = await request(
      'PUT',
      `${mediaPath(readyIds[0]!)}/cover`,
      owner,
      { version: 1 },
    );

    assert.equal(response.status, 409);

    const data = await response.json() as {
      code?: string;
    };

    assert.equal(
      data.code,
      'STALE_MEDIA_VERSION',
    );
  });

  await t.test('saves caption and alternative text', async () => {
    const id = readyIds[0]!;
    const version = await mediaVersion(id);

    const response = await request(
      'PATCH',
      `${mediaPath(id)}/details`,
      owner,
      {
        version,
        altText:
          'Brand identity presentation on a beige background',
        caption:
          'Final branding presentation for the client',
      },
    );

    assert.equal(response.status, 200);

    const saved =
      await prisma.projectMedia.findUniqueOrThrow({
        where: { id },
      });

    assert.equal(
      saved.altText,
      'Brand identity presentation on a beige background',
    );

    assert.equal(
      saved.caption,
      'Final branding presentation for the client',
    );

    assert.equal(saved.version, version + 1);
  });

  await t.test('rejects stale description edits', async () => {
    const id = readyIds[0]!;
    const current = await mediaVersion(id);

    const response = await request(
      'PATCH',
      `${mediaPath(id)}/details`,
      owner,
      {
        version: current - 1,
        altText: 'Outdated alternative text',
        caption: 'Outdated caption',
      },
    );

    assert.equal(response.status, 409);
  });

  await t.test('rejects incomplete gallery ordering', async () => {
    const response = await request(
      'PUT',
      orderPath(),
      owner,
      {
        items: [{
          id: readyIds[0],
          version: await mediaVersion(readyIds[0]!),
        }],
      },
    );

    assert.equal(response.status, 400);
  });

  await t.test('reorders all verified images', async () => {
    const before = await currentReadyOrder();

    const reversed = [...before]
      .reverse()
      .map((item) => ({
        id: item.id,
        version: item.version,
      }));

    const response = await request(
      'PUT',
      orderPath(),
      owner,
      { items: reversed },
    );

    assert.equal(response.status, 200);

    const afterOrder = await currentReadyOrder();

    assert.deepEqual(
      afterOrder.map((item) => item.id),
      reversed.map((item) => item.id),
    );

    assert.deepEqual(
      afterOrder.map((item) => item.sortOrder),
      [0, 1, 2],
    );

    for (const item of before) {
      const updated = afterOrder.find(
        (record) => record.id === item.id,
      );

      assert.ok(updated);
      assert.equal(
        updated.version,
        item.version + 1,
      );
    }

    const pending =
      await prisma.projectMedia.findUniqueOrThrow({
        where: { id: pendingId },
      });

    assert.equal(pending.status, 'PENDING');
    assert.equal(pending.version, 1);
  });

  await t.test('rejects outdated gallery ordering', async () => {
    const records = await currentReadyOrder();

    const response = await request(
      'PUT',
      orderPath(),
      owner,
      {
        items: records.map((item) => ({
          id: item.id,
          version: item.version - 1,
        })),
      },
    );

    assert.equal(response.status, 409);
  });

  await t.test('blocks mutations after publication', async () => {
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

    const id = readyIds[0]!;
    const version = await mediaVersion(id);

    const response = await request(
      'PATCH',
      `${mediaPath(id)}/details`,
      owner,
      {
        version,
        altText: 'Should not save',
        caption: null,
      },
    );

    assert.equal(response.status, 409);
  });
});
