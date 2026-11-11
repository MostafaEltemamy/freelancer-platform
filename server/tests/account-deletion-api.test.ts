import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {after, test} from 'node:test';
import {prisma} from '../src/database/prisma.js';
import {hashPassword} from '../src/modules/auth/password.js';
import {generateSessionToken} from '../src/modules/auth/session-tokens.js';
import {SESSION_COOKIE_NAME} from '../src/modules/auth/session-cookie.js';

// ---------------------------------------------------------
// Local database and API only.
// No R2 objects are created or deleted.
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
    'Account deletion tests require a local API and database.',
  );
}

const suffix = randomUUID().replace(/-/g, '');

const PASSWORD = 'TemporaryDeletionTest2026!';

const createdUserIds: string[] = [];
const createdObjectKeys: string[] = [];

interface TestAccount {
  id: string;
  cookie: string;
  csrf: string;
}

let owner!: TestAccount;
let other!: TestAccount;
let secondOwnerCookie = '';

let projectId = '';

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------

async function newSession(
  userId: string,
): Promise<string> {
  const { token, tokenHash } =
    generateSessionToken();

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(
        Date.now() + 60 * 60_000,
      ),
    },
  });

  return `${SESSION_COOKIE_NAME}=${token}`;
}

async function createAccount(
  label: string,
  withProfile: boolean,
): Promise<TestAccount> {
  const user = await prisma.user.create({
    data: {
      email:
        `delete-account-${label}-${suffix}@example.com`,

      displayName: `Deletion Test ${label}`,

      passwordCredential: {
        create: {
          passwordHash:
            await hashPassword(PASSWORD),
        },
      },

      ...(withProfile
        ? {
            freelancerProfile: {
              create: {
                username:
                  `del_${label}_${suffix.slice(0, 10)}`,
                headline: 'Temporary Test Freelancer',
                status: 'PUBLISHED' as const,
                publishedAt: new Date(),
                onboardingCompletedAt: new Date(),
              },
            },
          }
        : {}),
    },
  });

  createdUserIds.push(user.id);

  const cookie = await newSession(user.id);

  const response = await fetch(
    `${BASE}/api/auth/csrf`,
    {
      headers: {
        Cookie: cookie,
      },
    },
  );

  assert.equal(response.status, 200);

  const result = await response.json() as {
    csrfToken: string;
  };

  return {
    id: user.id,
    cookie,
    csrf: result.csrfToken,
  };
}

function testKeys() {
  const source =
    `projects/${projectId}/${randomUUID()}.png`;

  const preview =
    `projects/${projectId}/previews/` +
    `${randomUUID()}.webp`;

  createdObjectKeys.push(source, preview);

  return {
    storageKey: source,
    previewKey: preview,
  };
}

function deleteAccount(
  session: TestAccount | null,
  body: unknown,
  includeCsrf = true,
): Promise<Response> {
  const headers = new Headers({
    Origin: new URL(BASE).origin,
    'Content-Type': 'application/json',
  });

  if (session) {
    headers.set('Cookie', session.cookie);

    if (includeCsrf) {
      headers.set(
        'X-CSRF-Token',
        session.csrf,
      );
    }
  }

  return fetch(`${BASE}/api/auth/account`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify(body),
  });
}

async function accountExists(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true },
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
// Test cleanup
// ---------------------------------------------------------

after(async () => {
  try {
    // 1. Delete test accounts FIRST.
    // Their media records may create cleanup jobs
    // through the new PostgreSQL trigger.
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: createdUserIds,
          },
        },
      });
    }

    // 2. Remove only test-owned cleanup jobs AFTER
    // account deletion and its database triggers.
    if (createdObjectKeys.length > 0) {
      await prisma.storageDeletionJob.deleteMany({
        where: {
          objectKey: {
            in: createdObjectKeys,
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

test('Account deletion and R2 cleanup integrity', async (t) => {
  await t.test('creates isolated accounts and media', async () => {
    owner = await createAccount('owner', true);
    other = await createAccount('other', false);

    // Another session belonging to the same account
    // must also be revoked by account deletion.
    secondOwnerCookie =
      await newSession(owner.id);

    const profile =
      await prisma.freelancerProfile
        .findUniqueOrThrow({
          where: { userId: owner.id },
        });

    const project =
      await prisma.portfolioProject.create({
        data: {
          profileId: profile.id,
          slug: 'account-deletion-test',
          title: 'Account Deletion Test Project',
        },
      });

    projectId = project.id;

    await prisma.projectMedia.create({
      data: {
        projectId,
        ...testKeys(),
        originalFilename: 'verified.png',
        mimeType: 'image/png',
        fileSizeBytes: 1024,
        kind: 'IMAGE',
        status: 'READY',
        readyAt: new Date(),
      },
    });

    await prisma.projectMedia.create({
      data: {
        projectId,
        ...testKeys(),
        originalFilename: 'unfinished.png',
        mimeType: 'image/png',
        fileSizeBytes: 1024,
        kind: 'IMAGE',
        status: 'PENDING',
      },
    });

    assert.equal(
      await prisma.projectMedia.count({
        where: { projectId },
      }),
      2,
    );
  });

  await t.test('requires authentication', async () => {
    const response = await deleteAccount(
      null,
      {
        password: PASSWORD,
        confirmation: 'DELETE MY ACCOUNT',
      },
    );

    assert.equal(response.status, 401);
  });

  await t.test('requires CSRF protection', async () => {
    const response = await deleteAccount(
      owner,
      {
        password: PASSWORD,
        confirmation: 'DELETE MY ACCOUNT',
      },
      false,
    );

    assert.equal(response.status, 403);
    assert.ok(await accountExists(owner.id));
  });

  await t.test('requires exact confirmation', async () => {
    const response = await deleteAccount(
      owner,
      {
        password: PASSWORD,
        confirmation: 'DELETE ACCOUNT',
      },
    );

    assert.equal(response.status, 400);
    assert.ok(await accountExists(owner.id));
  });

  await t.test('rejects an incorrect password', async () => {
    const response = await deleteAccount(
      owner,
      {
        password: 'IncorrectPassword2026!',
        confirmation: 'DELETE MY ACCOUNT',
      },
    );

    assert.equal(response.status, 401);
    assert.ok(await accountExists(owner.id));
    assert.equal((await queuedKeys()).length, 0);
  });

  await t.test('deletes only the verified account', async () => {
    const response = await deleteAccount(
      owner,
      {
        password: PASSWORD,
        confirmation: 'DELETE MY ACCOUNT',
      },
    );

    assert.equal(response.status, 204);

    const cookieHeader =
      response.headers.get('set-cookie') ?? '';

    assert.ok(
      cookieHeader.includes(
        `${SESSION_COOKIE_NAME}=`,
      ),
    );

    assert.equal(
      await accountExists(owner.id),
      null,
    );

    assert.ok(
      await accountExists(other.id),
    );

    assert.equal(
      await prisma.portfolioProject.findUnique({
        where: { id: projectId },
      }),
      null,
    );

    assert.equal(
      await prisma.projectMedia.count({
        where: { projectId },
      }),
      0,
    );
  });

  await t.test('preserves four storage cleanup jobs', async () => {
    const jobs = await queuedKeys();

    // Two records, each with an original and preview.
    assert.equal(jobs.length, 4);

    assert.deepEqual(
      new Set(jobs.map((job) => job.objectKey)),
      new Set(createdObjectKeys),
    );

    // Recently created objects are protected by the
    // existing storage-cleanup grace period.
    const earliest =
      Date.now() + 25 * 60_000;

    for (const job of jobs) {
      assert.ok(
        job.nextAttemptAt.getTime() > earliest,
      );
    }
  });

  await t.test('revokes every account session', async () => {
    assert.equal(
      await prisma.session.count({
        where: { userId: owner.id },
      }),
      0,
    );

    for (const cookie of [
      owner.cookie,
      secondOwnerCookie,
    ]) {
      const response = await fetch(
        `${BASE}/api/auth/me`,
        {
          headers: { Cookie: cookie },
        },
      );

      assert.equal(response.status, 401);
    }
  });

  await t.test('preserves other users and their sessions', async () => {
    const response = await fetch(
      `${BASE}/api/auth/me`,
      {
        headers: {
          Cookie: other.cookie,
        },
      },
    );

    assert.equal(response.status, 200);
  });

  await t.test('rejects a repeated deletion request', async () => {
    const response = await deleteAccount(
      owner,
      {
        password: PASSWORD,
        confirmation: 'DELETE MY ACCOUNT',
      },
    );

    assert.equal(response.status, 401);
    assert.equal((await queuedKeys()).length, 4);
  });

  await t.test('supports accounts without a freelancer profile', async () => {
    const response = await deleteAccount(
      other,
      {
        password: PASSWORD,
        confirmation: 'DELETE MY ACCOUNT',
      },
    );

    assert.equal(response.status, 204);
    assert.equal(
      await accountExists(other.id),
      null,
    );

    assert.equal((await queuedKeys()).length, 4);
  });
});