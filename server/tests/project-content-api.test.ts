import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { prisma } from '../src/database/prisma.js';
import {generateSessionToken} from '../src/modules/auth/session-tokens.js';
import {SESSION_COOKIE_NAME} from '../src/modules/auth/session-cookie.js';
import {emptyProjectContent} from '../src/modules/freelancer/project-content.schemas.js';

const BASE =
  process.env.TEST_API_BASE_URL ??
  'http://localhost:5001';

const origin = new URL(BASE).origin;
const databaseUrl = process.env.DATABASE_URL;

// These tests must never run against production.
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
    'Project content API tests require a local API and database.',
  );
}

const unique = randomUUID().replace(/-/g, '');
const createdUserIds: string[] = [];

const path = '/api/freelancer/projects';

interface Session {
  id: string;
  profileId: string;
  cookie: string;
  csrf: string;
}

interface ProjectResult {
  project: {
    id: string;
    title: string;
    summary: string | null;
    version: number;
    content: unknown;
  };
}

function contentDocument() {
  return {
    schemaVersion: 1 as const,
    sections: [
      {
        id: randomUUID(),
        title: 'Project Overview',
        description: null,
        fields: [
          {
            id: randomUUID(),
            type: 'SHORT_TEXT' as const,
            label: 'Client',
            value: 'Café Luna',
          },
          {
            id: randomUUID(),
            type: 'LIST' as const,
            label: 'Deliverables',
            value: [
              'Brand guidelines',
              'Logo',
              'Packaging',
            ],
          },
        ],
      },
    ],
  };
}

async function makeSession(
  label: string,
): Promise<Session> {
  const user = await prisma.user.create({
    data: {
      email: `content-${label}-${unique}@example.com`,
      displayName: `Content Test ${label}`,
      freelancerProfile: {
        create: {
          username:
            `${label}_${unique.slice(0, 12)}`,
          headline:
            'Professional freelancer and consultant',
          bio:
            'I create professional projects and deliver high-quality work to clients.',
          countryCode: 'AE',
        },
      },
    },
    include: {
      freelancerProfile: true,
    },
  });

  createdUserIds.push(user.id);

  assert.ok(user.freelancerProfile);

  const { token, tokenHash } =
    generateSessionToken();

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt:
        new Date(Date.now() + 3_600_000),
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
    id: user.id,
    profileId: user.freelancerProfile.id,
    cookie,
    csrf: data.csrfToken,
  };
}

function request(
  endpoint: string,
  method:
    | 'GET'
    | 'POST'
    | 'PATCH'
    | 'PUT'
    | 'DELETE',
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

    if (
      method !== 'GET' &&
      includeCsrf
    ) {
      headers.set(
        'X-CSRF-Token',
        session.csrf,
      );
    }
  }

  if (body !== undefined) {
    headers.set(
      'Content-Type',
      'application/json',
    );
  }

  return fetch(
    `${BASE}${endpoint}`,
    {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : JSON.stringify(body),
    },
  );
}

after(async () => {
  try {
    await prisma.user.deleteMany({
      where: {
        id: {
          in: createdUserIds,
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});

test('Custom Project Content API', async (t) => {
  let owner!: Session;
  let other!: Session;

  let projectId = '';
  let version = 1;

  const initialContent = contentDocument();
  const updatedContent = contentDocument();

  updatedContent.sections[0]!.title =
    'Final Project Results';

  // ---------------------------------------------
  // 1 — Test accounts
  // ---------------------------------------------

  await t.test('creates isolated test accounts', async () => {
    owner = await makeSession('owner');
    other = await makeSession('other');

    assert.notEqual(owner.id, other.id);
  });

  // ---------------------------------------------
  // 2 — Authentication
  // ---------------------------------------------

  await t.test('requires authentication for project details', async () => {
    const response = await request(
      `${path}/${randomUUID()}`,
      'GET',
    );

    assert.equal(response.status, 401);
  });

  // ---------------------------------------------
  // 3 — CSRF protection
  // ---------------------------------------------

  await t.test('requires CSRF protection for content creation', async () => {
    const response = await request(
      path,
      'POST',
      owner,
      {
        slug: 'blocked-content',
        title: 'Blocked Content',
        content: initialContent,
      },
      false,
    );

    assert.equal(response.status, 403);
  });

  // ---------------------------------------------
  // 4 — Create content
  // ---------------------------------------------

  await t.test('creates a project with custom content', async () => {
    const response = await request(
      path,
      'POST',
      owner,
      {
        slug: 'brand-identity',
        title: 'Brand Identity Redesign',
        summary: 'A creative branding project.',
        visibility: 'PUBLIC',
        content: initialContent,
      },
    );

    assert.equal(response.status, 201);

    const data =
      await response.json() as ProjectResult;

    projectId = data.project.id;
    version = data.project.version;

    assert.equal(version, 1);
    assert.deepEqual(
      data.project.content,
      initialContent,
    );
  });

  // ---------------------------------------------
  // 5 — Lightweight list
  // ---------------------------------------------

  await t.test('does not load custom content in project lists', async () => {
    const response = await request(
      path,
      'GET',
      owner,
    );

    assert.equal(response.status, 200);

    const data = await response.json() as {
      projects: Record<string, unknown>[];
    };

    const project = data.projects.find(
      (item) => item.id === projectId,
    );

    assert.ok(project);

    assert.equal(
      Object.hasOwn(project, 'content'),
      false,
    );
  });

  // ---------------------------------------------
  // 6 — Full detail retrieval
  // ---------------------------------------------

  await t.test('retrieves the complete owned project', async () => {
    const response = await request(
      `${path}/${projectId}`,
      'GET',
      owner,
    );

    assert.equal(response.status, 200);

    const data =
      await response.json() as ProjectResult;

    assert.deepEqual(
      data.project.content,
      initialContent,
    );

    assert.equal(
      data.project.title,
      'Brand Identity Redesign',
    );
  });

  // ---------------------------------------------
  // 7 — Invalid field types
  // ---------------------------------------------

  await t.test('rejects unsupported custom field types', async () => {
    const invalidContent = contentDocument();

    const badField = {
      ...invalidContent.sections[0]!.fields[0]!,
      type: 'EXECUTABLE_SCRIPT',
      value: 'alert(1)',
    };

    const response = await request(
      path,
      'POST',
      owner,
      {
        slug: 'bad-field-type',
        title: 'Invalid Field Type',
        content: {
          ...invalidContent,
          sections: [
            {
              ...invalidContent.sections[0]!,
              fields: [badField],
            },
          ],
        },
      },
    );

    assert.equal(response.status, 400);
  });

  // ---------------------------------------------
  // 8 — Strict validation
  // ---------------------------------------------

  await t.test('rejects privileged custom field properties', async () => {
    const response = await request(
      `${path}/${projectId}`,
      'PATCH',
      owner,
      {
        version,
        content: {
          schemaVersion: 1,
          sections: [
            {
              id: randomUUID(),
              title: 'Invalid Section',
              description: null,
              fields: [
                {
                  id: randomUUID(),
                  label: 'Client',
                  type: 'SHORT_TEXT',
                  value: 'Test',
                  profileId: other.profileId,
                },
              ],
            },
          ],
        },
      },
    );

    assert.equal(response.status, 400);
  });

  // ---------------------------------------------
  // 9 — Oversized payload
  // ---------------------------------------------

  await t.test('rejects oversized custom content', async () => {
    const response = await request(
      `${path}/${projectId}`,
      'PATCH',
      owner,
      {
        version,
        content: {
          schemaVersion: 1,
          sections: [
            {
              id: randomUUID(),
              title: 'Large Section',
              description: null,
              fields: Array.from(
                { length: 14 },
                () => ({
                  id: randomUUID(),
                  label: 'Large text',
                  type: 'LONG_TEXT',
                  value: 'X'.repeat(10000),
                }),
              ),
            },
          ],
        },
      },
    );

    assert.equal(response.status, 400);
  });

  // ---------------------------------------------
  // 10 — Version-aware update
  // ---------------------------------------------

  await t.test('updates content and increments version once', async () => {
    const response = await request(
      `${path}/${projectId}`,
      'PATCH',
      owner,
      {
        version,
        content: updatedContent,
      },
    );

    assert.equal(response.status, 200);

    const data =
      await response.json() as ProjectResult;

    assert.equal(data.project.version, 2);
    assert.equal(
      data.project.title,
      'Brand Identity Redesign',
    );

    assert.deepEqual(
      data.project.content,
      updatedContent,
    );

    version = data.project.version;
  });

  // ---------------------------------------------
  // 11 — Database persistence
  // ---------------------------------------------

  await t.test('persists custom content in PostgreSQL', async () => {
    const project =
      await prisma.portfolioProject.findUniqueOrThrow({
        where: { id: projectId },
        select: {
          version: true,
          content: true,
        },
      });

    assert.equal(project.version, version);

    assert.deepEqual(
      project.content,
      updatedContent,
    );
  });

  // ---------------------------------------------
  // 12 — Partial update preserves content
  // ---------------------------------------------

  await t.test('preserves content when updating another field', async () => {
    const response = await request(
      `${path}/${projectId}`,
      'PATCH',
      owner,
      {
        version,
        summary: 'Updated project summary.',
      },
    );

    assert.equal(response.status, 200);

    const data =
      await response.json() as ProjectResult;

    assert.equal(
      data.project.summary,
      'Updated project summary.',
    );

    assert.deepEqual(
      data.project.content,
      updatedContent,
    );

    version = data.project.version;
    assert.equal(version, 3);
  });

  // ---------------------------------------------
  // 13 — Stale write protection
  // ---------------------------------------------

  await t.test('rejects stale content writes', async () => {
    const response = await request(
      `${path}/${projectId}`,
      'PATCH',
      owner,
      {
        version: version - 1,
        content: initialContent,
      },
    );

    assert.equal(response.status, 409);

    const data = await response.json() as {
      code: string;
    };

    assert.equal(
      data.code,
      'STALE_VERSION',
    );

    const persisted =
      await prisma.portfolioProject.findUniqueOrThrow({
        where: { id: projectId },
        select: {
          version: true,
          content: true,
        },
      });

    assert.equal(persisted.version, version);

    assert.deepEqual(
      persisted.content,
      updatedContent,
    );
  });

  // ---------------------------------------------
  // 14 — Cross-account access
  // ---------------------------------------------

  await t.test('prevents other accounts reading or updating content', async () => {
    const read = await request(
      `${path}/${projectId}`,
      'GET',
      other,
    );

    const update = await request(
      `${path}/${projectId}`,
      'PATCH',
      other,
      {
        version,
        content: initialContent,
      },
    );

    assert.equal(read.status, 404);
    assert.equal(update.status, 404);
  });

  // ---------------------------------------------
  // 15 — Missing and invalid IDs
  // ---------------------------------------------

  await t.test('handles invalid and missing project IDs', async () => {
    const invalid = await request(
      `${path}/not-a-valid-uuid`,
      'GET',
      owner,
    );

    const missing = await request(
      `${path}/${randomUUID()}`,
      'GET',
      owner,
    );

    assert.equal(invalid.status, 400);
    assert.equal(missing.status, 404);
  });

  // ---------------------------------------------
  // 16 — Published portfolio protection
  // ---------------------------------------------

  await t.test('allows reading but blocks editing when published', async () => {
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

    const read = await request(
      `${path}/${projectId}`,
      'GET',
      owner,
    );

    assert.equal(read.status, 200);

    const update = await request(
      `${path}/${projectId}`,
      'PATCH',
      owner,
      {
        version,
        content: initialContent,
      },
    );

    assert.equal(update.status, 409);
  });

  // ---------------------------------------------
  // 17 — Clear content explicitly
  // ---------------------------------------------

  await t.test('unpublishes and clears content safely', async () => {
    const unpublish = await request(
      '/api/freelancer/profile/unpublish',
      'POST',
      owner,
    );

    assert.equal(unpublish.status, 200);

    const response = await request(
      `${path}/${projectId}`,
      'PATCH',
      owner,
      {
        version,
        content: emptyProjectContent(),
      },
    );

    assert.equal(response.status, 200);

    const data =
      await response.json() as ProjectResult;

    assert.deepEqual(
      data.project.content,
      emptyProjectContent(),
    );

    version = data.project.version;
    assert.equal(version, 4);
  });

  // ---------------------------------------------
  // 18 — Backward compatibility
  // ---------------------------------------------

  await t.test('normalizes old projects with null content', async () => {
    // Seed a legacy-style project directly in the database.
    const oldProject =
      await prisma.portfolioProject.create({
        data: {
          profileId: owner.profileId,
          slug: 'legacy-project',
          title: 'Legacy Portfolio Project',
        },
        select: {
          id: true,
          content: true,
        },
      });

    assert.equal(oldProject.content, null);

    const response = await request(
      `${path}/${oldProject.id}`,
      'GET',
      owner,
    );

    assert.equal(response.status, 200);

    const data =
      await response.json() as ProjectResult;

    assert.deepEqual(
      data.project.content,
      emptyProjectContent(),
    );

    // The API must not rewrite legacy database records
    // simply because someone reads them.
    const persisted =
      await prisma.portfolioProject.findUniqueOrThrow({
        where: { id: oldProject.id },
        select: { content: true },
      });

    assert.equal(persisted.content, null);
  });
});
