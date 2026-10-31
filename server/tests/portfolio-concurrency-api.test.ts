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
  !['localhost', '127.0.0.1'].includes(new URL(BASE).hostname) ||
  !databaseUrl ||
  !['localhost', '127.0.0.1'].includes(
    new URL(databaseUrl).hostname,
  )
) {
  throw new Error(
    'Concurrency tests require a local API and local database.',
  );
}

const unique = randomUUID().replace(/-/g, '');
const createdUserIds: string[] = [];

interface Session {
  userId: string;
  username: string;
  cookie: string;
  csrf: string;
}

async function makeSession(label: string): Promise<Session> {
  const username =
    `r_${label.slice(0, 8)}_${unique.slice(0, 12)}`;

  const user = await prisma.user.create({
    data: {
      email: `race-${label}-${unique}@example.com`,
      displayName: `Concurrency Test ${label}`,
      freelancerProfile: {
        create: {
          username,
          headline: 'Professional Software Developer',
          bio: 'I develop reliable digital products and applications for clients.',
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

  const response = await fetch(`${BASE}/api/auth/csrf`, {
    headers: { Cookie: cookie },
  });

  assert.equal(response.status, 200);

  const data = await response.json() as {
    csrfToken: string;
  };

  assert.ok(data.csrfToken);

  return {
    userId: user.id,
    username,
    cookie,
    csrf: data.csrfToken,
  };
}

function request(
  path: string,
  method: 'POST' | 'PATCH',
  session: Session,
  body?: unknown,
): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method,
    headers: {
      Origin: origin,
      Cookie: session.cookie,
      'X-CSRF-Token': session.csrf,
      ...(body === undefined
        ? {}
        : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined
      ? undefined
      : JSON.stringify(body),
  });
}

async function readProfile(userId: string) {
  return prisma.freelancerProfile.findUniqueOrThrow({
    where: { userId },
    include: {
      projects: true,
      skills: true,
    },
  });
}

function assertOneWinner(
  publicationStatus: number,
  editStatus: number,
) {
  const publicationWon =
    publicationStatus === 200 && editStatus === 409;

  const editWon =
    publicationStatus === 409 && editStatus === 200;

  const creationWon =
    publicationStatus === 409 && editStatus === 201;

  assert.ok(
    publicationWon || editWon || creationWon,
    `Unexpected statuses: publish=${publicationStatus}, edit=${editStatus}`,
  );
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

test('Portfolio publication concurrency and integrity', async (t) => {
  await t.test(
    'publication cannot race past project creation',
    async () => {
      const session = await makeSession('project');

      const [publish, create] = await Promise.all([
        request(
          '/api/freelancer/profile/publish',
          'POST',
          session,
        ),
        request(
          '/api/freelancer/projects',
          'POST',
          session,
          {
            slug: 'racing-project',
            title: 'Concurrent Project',
            visibility: 'PUBLIC',
          },
        ),
      ]);

      assertOneWinner(publish.status, create.status);

      const profile = await readProfile(session.userId);

      if (publish.status === 200) {
        assert.equal(profile.status, 'PUBLISHED');
        assert.equal(profile.projects.length, 0);
      } else {
        assert.equal(profile.status, 'DRAFT');
        assert.equal(profile.onboardingCompletedAt, null);
        assert.equal(profile.projects.length, 1);
      }

      const publicResponse = await fetch(
        `${BASE}/api/public/freelancers/${session.username}`,
      );

      if (profile.status === 'PUBLISHED') {
        assert.equal(publicResponse.status, 200);

        const data = await publicResponse.json() as {
          profile: { projects: unknown[] };
        };

        assert.deepEqual(data.profile.projects, []);
      } else {
        assert.equal(publicResponse.status, 404);
      }
    },
  );

  await t.test(
    'publication cannot race past skill creation',
    async () => {
      const session = await makeSession('skill');

      const [publish, create] = await Promise.all([
        request(
          '/api/freelancer/profile/publish',
          'POST',
          session,
        ),
        request(
          '/api/freelancer/skills',
          'POST',
          session,
          { name: 'TypeScript' },
        ),
      ]);

      assertOneWinner(publish.status, create.status);

      const profile = await readProfile(session.userId);

      if (publish.status === 200) {
        assert.equal(profile.status, 'PUBLISHED');
        assert.equal(profile.skills.length, 0);
      } else {
        assert.equal(profile.status, 'DRAFT');
        assert.equal(profile.onboardingCompletedAt, null);
        assert.equal(profile.skills.length, 1);
      }
    },
  );

  await t.test(
    'profile edits cannot bypass publication validation',
    async () => {
      const session = await makeSession('editing');

      const [publish, edit] = await Promise.all([
        request(
          '/api/freelancer/profile/publish',
          'POST',
          session,
        ),
        request(
          '/api/freelancer/profile',
          'PATCH',
          session,
          { headline: 'Updated Professional Developer' },
        ),
      ]);

      assertOneWinner(publish.status, edit.status);

      const profile = await readProfile(session.userId);

      if (publish.status === 200) {
        assert.equal(profile.status, 'PUBLISHED');
        assert.equal(
          profile.headline,
          'Professional Software Developer',
        );
      } else {
        assert.equal(profile.status, 'DRAFT');
        assert.equal(profile.onboardingCompletedAt, null);
        assert.equal(
          profile.headline,
          'Updated Professional Developer',
        );
      }
    },
  );

  let repeatSession!: Session;
  let originalPublishedAt = '';

  await t.test(
    'simultaneous publish requests are idempotent',
    async () => {
      repeatSession = await makeSession('repeat');

      const responses = await Promise.all([
        request(
          '/api/freelancer/profile/publish',
          'POST',
          repeatSession,
        ),
        request(
          '/api/freelancer/profile/publish',
          'POST',
          repeatSession,
        ),
      ]);

      assert.deepEqual(
        responses.map((response) => response.status),
        [200, 200],
      );

      const results = await Promise.all(
        responses.map((response) => response.json()),
      ) as {
        profile: { publishedAt: string };
      }[];

      assert.equal(
        results[0]!.profile.publishedAt,
        results[1]!.profile.publishedAt,
      );

      originalPublishedAt = results[0]!.profile.publishedAt;

      const profile = await readProfile(repeatSession.userId);

      assert.equal(profile.status, 'PUBLISHED');
      assert.equal(
        profile.publishedAt?.toISOString(),
        originalPublishedAt,
      );
    },
  );

  await t.test(
    'simultaneous unpublish requests are idempotent',
    async () => {
      const responses = await Promise.all([
        request(
          '/api/freelancer/profile/unpublish',
          'POST',
          repeatSession,
        ),
        request(
          '/api/freelancer/profile/unpublish',
          'POST',
          repeatSession,
        ),
      ]);

      assert.deepEqual(
        responses.map((response) => response.status),
        [200, 200],
      );

      const profile = await readProfile(repeatSession.userId);

      assert.equal(profile.status, 'DRAFT');
      assert.equal(profile.publishedAt, null);
    },
  );

  await t.test(
    'concurrent duplicate project slugs cannot both save',
    async () => {
      const session = await makeSession('dup-project');

      const responses = await Promise.all([
        request(
          '/api/freelancer/projects',
          'POST',
          session,
          {
            slug: 'shared-slug',
            title: 'Project A',
          },
        ),
        request(
          '/api/freelancer/projects',
          'POST',
          session,
          {
            slug: 'shared-slug',
            title: 'Project B',
          },
        ),
      ]);

      assert.deepEqual(
        responses.map((response) => response.status)
          .sort((a, b) => a - b),
        [201, 409],
      );

      const profile = await readProfile(session.userId);

      assert.equal(profile.projects.length, 1);
    },
  );

  await t.test(
    'concurrent duplicate skills cannot both save',
    async () => {
      const session = await makeSession('dup-skill');

      const responses = await Promise.all([
        request(
          '/api/freelancer/skills',
          'POST',
          session,
          { name: 'React' },
        ),
        request(
          '/api/freelancer/skills',
          'POST',
          session,
          { name: 'REACT' },
        ),
      ]);

      assert.deepEqual(
        responses.map((response) => response.status)
          .sort((a, b) => a - b),
        [201, 409],
      );

      const profile = await readProfile(session.userId);

      assert.equal(profile.skills.length, 1);
      assert.equal(profile.skills[0]?.normalizedName, 'react');
    },
  );
});
