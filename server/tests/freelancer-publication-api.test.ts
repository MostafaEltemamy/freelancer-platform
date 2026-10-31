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

const origin = new URL(BASE).origin;
const databaseUrl = process.env.DATABASE_URL;

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
    'Publication tests require a local development API and database.',
  );
}

const unique = randomUUID().replace(/-/g, '');
const username = `pub_${unique.slice(0, 16)}`;

const createdUserIds: string[] = [];

interface Session {
  id: string;
  cookie: string;
  csrf: string;
}

async function createTestSession(
  label: string,
  withProfile: boolean,
): Promise<Session> {
  const user = await prisma.user.create({
    data: {
      email: `publication-${label}-${unique}@example.com`,
      displayName: `Publication Test ${label}`,
      ...(withProfile
        ? {
            freelancerProfile: {
              create: { username },
            },
          }
        : {}),
    },
  });

  createdUserIds.push(user.id);

  const { token, tokenHash } = generateSessionToken();

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
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

  assert.match(data.csrfToken, /^[a-f0-9]{64}$/);

  return {
    id: user.id,
    cookie,
    csrf: data.csrfToken,
  };
}

function request(
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
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
    body: body === undefined
      ? undefined
      : JSON.stringify(body),
  });
}

const publishPath = '/api/freelancer/profile/publish';
const unpublishPath = '/api/freelancer/profile/unpublish';
const profilePath = '/api/freelancer/profile';
const publicPath = `/api/public/freelancers/${username}`;

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

test('Freelancer publication lifecycle', async (t) => {
  let owner!: Session;
  let other!: Session;
  let initialPublishedAt = '';

  await t.test('creates two isolated sessions', async () => {
    owner = await createTestSession('owner', true);
    other = await createTestSession('other', false);

    assert.notEqual(owner.cookie, other.cookie);
  });

  await t.test(
    'requires authentication and CSRF',
    async () => {
      const unauthenticated = await request(
        publishPath,
        'POST',
      );

      assert.equal(unauthenticated.status, 401);

      const missingCsrf = await request(
        publishPath,
        'POST',
        owner,
        undefined,
        false,
      );

      assert.equal(missingCsrf.status, 403);
    },
  );

  await t.test(
    'rejects publishing an incomplete profile',
    async () => {
      const response = await request(
        publishPath,
        'POST',
        owner,
      );

      assert.equal(response.status, 422);

      const result = await response.json() as {
        missingFields: string[];
      };

      assert.ok(result.missingFields.includes('headline'));
      assert.ok(result.missingFields.includes('bio'));
      assert.ok(result.missingFields.includes('countryCode'));
    },
  );

  await t.test(
    'saves valid professional information',
    async () => {
      const response = await request(
        profilePath,
        'PATCH',
        owner,
        {
          headline: 'Professional Software Developer',
          bio: 'I develop reliable web applications and professional digital products for clients.',
          countryCode: 'AE',
          city: 'Dubai',
          websiteUrl: 'https://example.com',
        },
      );

      assert.equal(response.status, 200);
    },
  );

  await t.test(
    'requires completed onboarding before publication',
    async () => {
      const response = await request(
        publishPath,
        'POST',
        owner,
      );

      assert.equal(response.status, 409);
    },
  );

  await t.test(
    'completes onboarding while remaining private',
    async () => {
      const completion = await request(
        '/api/freelancer/onboarding/complete',
        'POST',
        owner,
      );

      assert.equal(completion.status, 200);

      const publicResponse = await request(
        publicPath,
        'GET',
      );

      assert.equal(publicResponse.status, 404);
    },
  );

  await t.test('publishes the completed profile', async () => {
    const response = await request(
      publishPath,
      'POST',
      owner,
    );

    assert.equal(response.status, 200);

    const data = await response.json() as {
      profile: {
        status: string;
        publishedAt: string | null;
      };
    };

    assert.equal(data.profile.status, 'PUBLISHED');
    assert.ok(data.profile.publishedAt);

    initialPublishedAt = data.profile.publishedAt;
  });

  await t.test(
    'exposes only approved public information',
    async () => {
      const response = await request(
        publicPath,
        'GET',
      );

      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get('cache-control'),
        'no-store',
      );

      const data = await response.json() as {
        profile: Record<string, unknown>;
      };

      assert.equal(data.profile.username, username);
      assert.equal(
        data.profile.headline,
        'Professional Software Developer',
      );

      assert.equal(Object.hasOwn(data.profile, 'email'), false);
      assert.equal(Object.hasOwn(data.profile, 'userId'), false);
      assert.equal(Object.hasOwn(data.profile, 'id'), false);
    },
  );

  await t.test(
    'makes repeated publication idempotent',
    async () => {
      const response = await request(
        publishPath,
        'POST',
        owner,
      );

      assert.equal(response.status, 200);

      const data = await response.json() as {
        profile: { publishedAt: string };
      };

      assert.equal(
        data.profile.publishedAt,
        initialPublishedAt,
      );
    },
  );

  await t.test(
    'prevents editing while published',
    async () => {
      const response = await request(
        profilePath,
        'PATCH',
        owner,
        { headline: 'Unauthorized Live Edit' },
      );

      assert.equal(response.status, 409);
    },
  );

  await t.test(
    'prevents another account from unpublishing',
    async () => {
      const response = await request(
        unpublishPath,
        'POST',
        other,
      );

      assert.equal(response.status, 409);

      const publicResponse = await request(
        publicPath,
        'GET',
      );

      assert.equal(publicResponse.status, 200);
    },
  );

  await t.test(
    'unpublishes and immediately hides the profile',
    async () => {
      const response = await request(
        unpublishPath,
        'POST',
        owner,
      );

      assert.equal(response.status, 200);

      const data = await response.json() as {
        profile: {
          status: string;
          publishedAt: string | null;
        };
      };

      assert.equal(data.profile.status, 'DRAFT');
      assert.equal(data.profile.publishedAt, null);

      const publicResponse = await request(
        publicPath,
        'GET',
      );

      assert.equal(publicResponse.status, 404);
      assert.equal(
        publicResponse.headers.get('cache-control'),
        'no-store',
      );
    },
  );

  await t.test(
    'allows repeated unpublication',
    async () => {
      const response = await request(
        unpublishPath,
        'POST',
        owner,
      );

      assert.equal(response.status, 200);
    },
  );

  await t.test(
    'requires revalidation after editing',
    async () => {
      const edit = await request(
        profilePath,
        'PATCH',
        owner,
        {
          headline: 'Updated Professional Developer',
        },
      );

      assert.equal(edit.status, 200);

      const data = await edit.json() as {
        profile: {
          onboardingCompletedAt: string | null;
        };
      };

      assert.equal(data.profile.onboardingCompletedAt, null);

      const publish = await request(
        publishPath,
        'POST',
        owner,
      );

      assert.equal(publish.status, 409);
    },
  );

  await t.test(
    'can complete onboarding and republish',
    async () => {
      const complete = await request(
        '/api/freelancer/onboarding/complete',
        'POST',
        owner,
      );

      assert.equal(complete.status, 200);

      const publish = await request(
        publishPath,
        'POST',
        owner,
      );

      assert.equal(publish.status, 200);

      const visible = await request(
        publicPath,
        'GET',
      );

      assert.equal(visible.status, 200);

      const data = await visible.json() as {
        profile: { headline: string };
      };

      assert.equal(
        data.profile.headline,
        'Updated Professional Developer',
      );
    },
  );
});
