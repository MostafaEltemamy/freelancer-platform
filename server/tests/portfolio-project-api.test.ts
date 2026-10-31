import 'dotenv/config';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import { prisma } from '../src/database/prisma.js';

import {
  generateSessionToken,
} from '../src/modules/auth/session-tokens.js';

import {
  SESSION_COOKIE_NAME,
} from '../src/modules/auth/session-cookie.js';

const BASE =
  process.env.TEST_API_BASE_URL ?? 'http://localhost:5001';

const databaseUrl = process.env.DATABASE_URL;
const origin = new URL(BASE).origin;

if (
  process.env.NODE_ENV === 'production' ||
  !['localhost', '127.0.0.1'].includes(
    new URL(BASE).hostname,
  ) ||
  !databaseUrl ||
  !['localhost', '127.0.0.1'].includes(
    new URL(databaseUrl).hostname,
  )
) {
  throw new Error(
    'Tests require a local development API and database.',
  );
}

const unique = randomUUID().replace(/-/g, '');
const createdUserIds: string[] = [];

interface Session {
  id: string;
  cookie: string;
  csrf: string;
}

async function makeSession(label: string): Promise<Session> {
  const user = await prisma.user.create({
    data: {
      email: `projects-${label}-${unique}@example.com`,
      displayName: `Test ${label}`,
      freelancerProfile: {
        create: {
          username: `${label}_${unique.slice(0, 12)}`,
          headline: 'Professional Software Developer',
          bio: 'I develop reliable applications and digital products for clients.',
          countryCode: 'AE',
          onboardingCompletedAt: new Date(),
        },
      },
    },
  });

  createdUserIds.push(user.id);

  const { token, tokenHash } = generateSessionToken();

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });

  const cookie = `${SESSION_COOKIE_NAME}=${token}`;

  const csrfResponse = await fetch(`${BASE}/api/auth/csrf`, {
    headers: {
      Cookie: cookie,
    },
  });

  assert.equal(csrfResponse.status, 200);

  const { csrfToken } = await csrfResponse.json() as {
    csrfToken: string;
  };

  return {
    id: user.id,
    cookie,
    csrf: csrfToken,
  };
}

function request(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  session?: Session,
  body?: unknown,
  includeCsrf = true,
): Promise<Response> {
  const headers = new Headers();

  if (method !== 'GET') {
    headers.set('Origin', origin);
  }

  if (session) {
    headers.set('Cookie', session.cookie);

    if (method !== 'GET' && includeCsrf) {
      headers.set('X-CSRF-Token', session.csrf);
    }
  }

  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${BASE}${path}`, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : JSON.stringify(body),
  });
}

after(async () => {
  try {
    await prisma.user.deleteMany({
      where: {
        id: { in: createdUserIds },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});

test('Portfolio Projects API', async (t) => {
  let owner!: Session;
  let other!: Session;

  let firstId = '';
  let secondId = '';

  // Track the current database versions.
  let firstVersion = 1;
  let secondVersion = 1;

  const projectsPath = '/api/freelancer/projects';

  // -------------------------------------------------
  // TEST 1 — Create test accounts
  // -------------------------------------------------

  await t.test(
    'creates authenticated test accounts',
    async () => {
      owner = await makeSession('owner');
      other = await makeSession('other');

      assert.notEqual(owner.id, other.id);
    },
  );

  // -------------------------------------------------
  // TEST 2 — Authentication
  // -------------------------------------------------

  await t.test(
    'requires authentication',
    async () => {
      const response = await request(
        projectsPath,
        'GET',
      );

      assert.equal(response.status, 401);
    },
  );

  // -------------------------------------------------
  // TEST 3 — CSRF protection
  // -------------------------------------------------

  await t.test(
    'requires CSRF protection',
    async () => {
      const response = await request(
        projectsPath,
        'POST',
        owner,
        {
          slug: 'test-project',
          title: 'Test Project',
        },
        false,
      );

      assert.equal(response.status, 403);
    },
  );

  // -------------------------------------------------
  // TEST 4 — Input validation
  // -------------------------------------------------

  await t.test(
    'rejects invalid input and date ranges',
    async () => {
      const privileged = await request(
        projectsPath,
        'POST',
        owner,
        {
          slug: 'test-project',
          title: 'Test Project',
          profileId: other.id,
        },
      );

      assert.equal(privileged.status, 400);

      const invalidDates = await request(
        projectsPath,
        'POST',
        owner,
        {
          slug: 'invalid-dates',
          title: 'Invalid Dates',
          startedOn: '2026-12-01',
          endedOn: '2026-01-01',
        },
      );

      assert.equal(invalidDates.status, 400);
    },
  );

  // -------------------------------------------------
  // TEST 5 — Create first private project
  // -------------------------------------------------

  await t.test(
    'creates a private project',
    async () => {
      const response = await request(
        projectsPath,
        'POST',
        owner,
        {
          slug: 'My-First-Project',
          title: 'Research Dashboard',
          summary: 'Scientific data visualization',
          technologies: ['React', 'TypeScript'],
          sortOrder: 10,
        },
      );

      assert.equal(response.status, 201);

      const data = await response.json() as {
        project: {
          id: string;
          slug: string;
          visibility: string;
          technologies: string[];
          version: number;
        };
      };

      firstId = data.project.id;
      firstVersion = data.project.version;

      assert.equal(firstVersion, 1);

      assert.equal(
        data.project.slug,
        'my-first-project',
      );

      assert.equal(
        data.project.visibility,
        'PRIVATE',
      );

      assert.deepEqual(
        data.project.technologies,
        ['React', 'TypeScript'],
      );

      const profile =
        await prisma.freelancerProfile.findUnique({
          where: {
            userId: owner.id,
          },
          select: {
            onboardingCompletedAt: true,
          },
        });

      assert.equal(
        profile?.onboardingCompletedAt,
        null,
      );
    },
  );

  // -------------------------------------------------
  // TEST 6 — Duplicate slug protection
  // -------------------------------------------------

  await t.test(
    'rejects a duplicate project slug',
    async () => {
      const response = await request(
        projectsPath,
        'POST',
        owner,
        {
          slug: 'my-first-project',
          title: 'Duplicated Project',
        },
      );

      assert.equal(response.status, 409);
    },
  );

  // -------------------------------------------------
  // TEST 7 — Same slug in different accounts
  // -------------------------------------------------

  await t.test(
    'allows the same slug for another freelancer',
    async () => {
      const response = await request(
        projectsPath,
        'POST',
        other,
        {
          slug: 'my-first-project',
          title: 'Independent Project',
        },
      );

      assert.equal(response.status, 201);
    },
  );

  // -------------------------------------------------
  // TEST 8 — Ownership protection
  // -------------------------------------------------

  await t.test(
    'prevents cross-account modification',
    async () => {
      const edit = await request(
        `${projectsPath}/${firstId}`,
        'PATCH',
        other,
        {
          title: 'Changed by someone else',
          version: firstVersion,
        },
      );

      const remove = await request(
        `${projectsPath}/${firstId}`,
        'DELETE',
        other,
        {
          version: firstVersion,
        },
      );

      assert.equal(edit.status, 404);
      assert.equal(remove.status, 404);
    },
  );

  // -------------------------------------------------
  // TEST 9 — Create second project
  // -------------------------------------------------

  await t.test(
    'creates a second project',
    async () => {
      const response = await request(
        projectsPath,
        'POST',
        owner,
        {
          slug: 'second-project',
          title: 'Laboratory Management System',
          sortOrder: 20,
        },
      );

      assert.equal(response.status, 201);

      const data = await response.json() as {
        project: {
          id: string;
          version: number;
        };
      };

      secondId = data.project.id;
      secondVersion = data.project.version;

      assert.equal(secondVersion, 1);
    },
  );

  // -------------------------------------------------
  // TEST 10 — Update and increment version
  // -------------------------------------------------

  await t.test(
    'updates only the owners project',
    async () => {
      const response = await request(
        `${projectsPath}/${firstId}`,
        'PATCH',
        owner,
        {
          title: 'Updated Research Dashboard',
          visibility: 'PUBLIC',
          startedOn: '2026-01-01',
          endedOn: '2026-06-30',
          version: firstVersion,
        },
      );

      assert.equal(response.status, 200);

      const data = await response.json() as {
        project: {
          title: string;
          visibility: string;
          version: number;
        };
      };

      assert.equal(
        data.project.title,
        'Updated Research Dashboard',
      );

      assert.equal(
        data.project.visibility,
        'PUBLIC',
      );

      // Version 1 becomes version 2.
      firstVersion = data.project.version;

      assert.equal(firstVersion, 2);
    },
  );

  // -------------------------------------------------
  // TEST 11 — Require versions
  // -------------------------------------------------

  await t.test(
    'requires versions for all project mutations',
    async () => {
      const update = await request(
        `${projectsPath}/${firstId}`,
        'PATCH',
        owner,
        {
          title: 'Update without version',
        },
      );

      const remove = await request(
        `${projectsPath}/${firstId}`,
        'DELETE',
        owner,
      );

      const reorder = await request(
        `${projectsPath}/order`,
        'PUT',
        owner,
        {
          ids: [firstId, secondId],
        },
      );

      assert.deepEqual(
        [
          update.status,
          remove.status,
          reorder.status,
        ],
        [400, 400, 400],
      );
    },
  );

  // -------------------------------------------------
  // TEST 12 — Stale update and delete protection
  // -------------------------------------------------

  await t.test(
    'rejects stale project edits and deletions',
    async () => {
      const staleVersion = firstVersion - 1;

      const update = await request(
        `${projectsPath}/${firstId}`,
        'PATCH',
        owner,
        {
          title: 'Outdated Browser Edit',
          version: staleVersion,
        },
      );

      const remove = await request(
        `${projectsPath}/${firstId}`,
        'DELETE',
        owner,
        {
          version: staleVersion,
        },
      );

      assert.equal(update.status, 409);
      assert.equal(remove.status, 409);

      const updateResult = await update.json() as {
        code: string;
      };

      const deleteResult = await remove.json() as {
        code: string;
      };

      assert.equal(
        updateResult.code,
        'STALE_VERSION',
      );

      assert.equal(
        deleteResult.code,
        'STALE_VERSION',
      );

      // Verify that the previous saved data is unchanged.
      const saved =
        await prisma.portfolioProject.findUniqueOrThrow({
          where: {
            id: firstId,
          },
          select: {
            title: true,
            version: true,
          },
        });

      assert.equal(
        saved.title,
        'Updated Research Dashboard',
      );

      assert.equal(saved.version, firstVersion);
    },
  );

  // -------------------------------------------------
  // TEST 13 — Reorder projects atomically
  // -------------------------------------------------

  await t.test(
    'reorders all projects atomically',
    async () => {
      const response = await request(
        `${projectsPath}/order`,
        'PUT',
        owner,
        {
          items: [
            {
              id: secondId,
              version: secondVersion,
            },
            {
              id: firstId,
              version: firstVersion,
            },
          ],
        },
      );

      assert.equal(response.status, 200);

      const data = await response.json() as {
        projects: {
          id: string;
          sortOrder: number;
          version: number;
        }[];
      };

      assert.deepEqual(
        data.projects.map((project) => project.id),
        [secondId, firstId],
      );

      assert.deepEqual(
        data.projects.map((project) => project.sortOrder),
        [0, 1],
      );

      // Save the incremented versions after reordering.
      secondVersion = data.projects[0]!.version;
      firstVersion = data.projects[1]!.version;

      assert.equal(secondVersion, 2);
      assert.equal(firstVersion, 3);
    },
  );

  // -------------------------------------------------
  // TEST 14 — Reject incomplete ordering
  // -------------------------------------------------

  await t.test(
    'rejects incomplete ordering',
    async () => {
      const response = await request(
        `${projectsPath}/order`,
        'PUT',
        owner,
        {
          items: [
            {
              id: firstId,
              version: firstVersion,
            },
          ],
        },
      );

      assert.equal(response.status, 409);
    },
  );

  // -------------------------------------------------
  // TEST 15 — Publish freelancer profile
  // -------------------------------------------------

  await t.test(
    'publishes the parent freelancer profile',
    async () => {
      const complete = await request(
        '/api/freelancer/onboarding/complete',
        'POST',
        owner,
      );

      assert.equal(complete.status, 200);

      const publish = await request(
        '/api/freelancer/profile/publish',
        'POST',
        owner,
      );

      assert.equal(publish.status, 200);
    },
  );

  // -------------------------------------------------
  // TEST 16 — Published profile protection
  // -------------------------------------------------

  await t.test(
    'blocks project changes while published',
    async () => {
      const create = await request(
        projectsPath,
        'POST',
        owner,
        {
          slug: 'blocked-project',
          title: 'Blocked Project',
        },
      );

      const update = await request(
        `${projectsPath}/${firstId}`,
        'PATCH',
        owner,
        {
          title: 'Blocked Update',
          version: firstVersion,
        },
      );

      const remove = await request(
        `${projectsPath}/${firstId}`,
        'DELETE',
        owner,
        {
          version: firstVersion,
        },
      );

      const reorder = await request(
        `${projectsPath}/order`,
        'PUT',
        owner,
        {
          items: [
            {
              id: firstId,
              version: firstVersion,
            },
            {
              id: secondId,
              version: secondVersion,
            },
          ],
        },
      );

      assert.deepEqual(
        [
          create.status,
          update.status,
          remove.status,
          reorder.status,
        ],
        [409, 409, 409, 409],
      );
    },
  );

  // -------------------------------------------------
  // TEST 17 — Unpublish and delete
  // -------------------------------------------------

  await t.test(
    'unpublishes and allows deletion',
    async () => {
      const unpublish = await request(
        '/api/freelancer/profile/unpublish',
        'POST',
        owner,
      );

      assert.equal(unpublish.status, 200);

      const remove = await request(
        `${projectsPath}/${firstId}`,
        'DELETE',
        owner,
        {
          version: firstVersion,
        },
      );

      assert.equal(remove.status, 204);
    },
  );

  // -------------------------------------------------
  // TEST 18 — Owner-only project listing
  // -------------------------------------------------

  await t.test(
    'lists only the owners remaining projects',
    async () => {
      const response = await request(
        projectsPath,
        'GET',
        owner,
      );

      assert.equal(response.status, 200);

      const data = await response.json() as {
        projects: {
          id: string;
          version: number;
        }[];
      };

      assert.deepEqual(
        data.projects.map((item) => item.id),
        [secondId],
      );

      assert.equal(
        data.projects[0]?.version,
        secondVersion,
      );
    },
  );
});
