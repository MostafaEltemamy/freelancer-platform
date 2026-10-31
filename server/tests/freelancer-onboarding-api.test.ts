import 'dotenv/config';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import { prisma } from '../src/database/prisma.js';

const BASE = process.env.TEST_API_BASE_URL ??
  'http://localhost:5001';

const origin = new URL(BASE).origin;
const databaseUrl = process.env.DATABASE_URL;

if (
  !['localhost', '127.0.0.1'].includes(new URL(BASE).hostname) ||
  !databaseUrl ||
  !['localhost', '127.0.0.1'].includes(
    new URL(databaseUrl).hostname,
  )
) {
  throw new Error('Tests require a local API and database.');
}

const unique = randomUUID().replace(/-/g, '');
const password = 'SecureTestPassword2026!';
const username = `onb_a_${unique.slice(0, 12)}`;
const secondUsername = `onb_b_${unique.slice(0, 12)}`;

const createdUserIds: string[] = [];

interface Session {
  id: string;
  cookie: string;
  csrf: string;
}

function request(
  path: string,
  method = 'GET',
  session?: Session,
  payload?: unknown,
  includeCsrf = true,
) {
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

  if (payload !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${BASE}${path}`, {
    method,
    headers,
    body: payload === undefined
      ? undefined
      : JSON.stringify(payload),
  });
}

async function createSession(label: string): Promise<Session> {
  const email = `onboarding-${label}-${unique}@example.com`;

  const registration = await request(
    '/api/auth/register',
    'POST',
    undefined,
    {
      email,
      displayName: `Test ${label}`,
      password,
    },
  );

  assert.equal(registration.status, 201);

  const data = await registration.json() as {
    user: { id: string };
  };

  createdUserIds.push(data.user.id);

  const login = await request(
    '/api/auth/login',
    'POST',
    undefined,
    { email, password },
  );

  assert.equal(login.status, 200);

  const setCookie = login.headers.get('set-cookie');
  assert.ok(setCookie);

  const cookie = setCookie.split(';', 1)[0];
  assert.ok(cookie);

  const csrfResponse = await request(
    '/api/auth/csrf',
    'GET',
    { id: data.user.id, cookie, csrf: '' },
  );

  assert.equal(csrfResponse.status, 200);

  const csrfData = await csrfResponse.json() as {
    csrfToken: string;
  };

  return {
    id: data.user.id,
    cookie,
    csrf: csrfData.csrfToken,
  };
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

test('Freelancer onboarding API integration tests', async (t) => {
  let first!: Session;
  let second!: Session;

  await t.test('creates two authenticated users', async () => {
    first = await createSession('first');
    second = await createSession('second');

    assert.notEqual(first.cookie, second.cookie);
  });

  await t.test('rejects unauthenticated access', async () => {
    const response = await request('/api/freelancer/profile');

    assert.equal(response.status, 401);
  });

  await t.test('new accounts have no profile', async () => {
    const response = await request(
      '/api/freelancer/profile',
      'GET',
      first,
    );

    assert.equal(response.status, 200);

    const data = await response.json() as {
      profile: unknown;
    };

    assert.equal(data.profile, null);
  });

  await t.test('requires a username before editing', async () => {
    const response = await request(
      '/api/freelancer/profile',
      'PATCH',
      first,
      { headline: 'Molecular Biology Specialist' },
    );

    assert.equal(response.status, 409);
  });

  await t.test('reserves independent usernames', async () => {
    const a = await request(
      '/api/freelancer/username',
      'POST',
      first,
      { username },
    );

    const b = await request(
      '/api/freelancer/username',
      'POST',
      second,
      { username: secondUsername },
    );

    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
  });

  await t.test('requires CSRF for editing', async () => {
    const response = await request(
      '/api/freelancer/profile',
      'PATCH',
      first,
      { headline: 'Molecular Biology Specialist' },
      false,
    );

    assert.equal(response.status, 403);
  });

  await t.test('rejects privileged and invalid fields', async () => {
    const privileged = await request(
      '/api/freelancer/profile',
      'PATCH',
      first,
      {
        headline: 'Professional Freelancer',
        status: 'PUBLISHED',
        userId: second.id,
      },
    );

    assert.equal(privileged.status, 400);

    const invalidWebsite = await request(
      '/api/freelancer/profile',
      'PATCH',
      first,
      { websiteUrl: 'javascript:alert(1)' },
    );

    assert.equal(invalidWebsite.status, 400);
  });

  await t.test('saves a partial draft', async () => {
    const response = await request(
      '/api/freelancer/profile',
      'PATCH',
      first,
      {
        headline: '  Molecular Biology Specialist  ',
        city: 'Al Ain',
      },
    );

    assert.equal(response.status, 200);

    const data = await response.json() as {
      profile: {
        username: string;
        headline: string;
        city: string;
        status: string;
      };
    };

    assert.equal(data.profile.username, username);
    assert.equal(
      data.profile.headline,
      'Molecular Biology Specialist',
    );
    assert.equal(data.profile.city, 'Al Ain');
    assert.equal(data.profile.status, 'DRAFT');
  });

  await t.test('requires complete profile information', async () => {
    const response = await request(
      '/api/freelancer/onboarding/complete',
      'POST',
      first,
    );

    assert.equal(response.status, 422);

    const data = await response.json() as {
      missingFields: string[];
    };

    assert.ok(data.missingFields.includes('bio'));
    assert.ok(data.missingFields.includes('countryCode'));
  });

  await t.test('saves remaining onboarding details', async () => {
    const response = await request(
      '/api/freelancer/profile',
      'PATCH',
      first,
      {
        bio: 'I help clients with molecular biology, research, and scientific data analysis.',
        countryCode: 'ae',
        websiteUrl: 'https://example.com',
      },
    );

    assert.equal(response.status, 200);

    const data = await response.json() as {
      profile: { countryCode: string };
    };

    assert.equal(data.profile.countryCode, 'AE');
  });

  await t.test('completes onboarding idempotently', async () => {
    const firstResponse = await request(
      '/api/freelancer/onboarding/complete',
      'POST',
      first,
    );

    assert.equal(firstResponse.status, 200);

    const firstData = await firstResponse.json() as {
      profile: {
        status: string;
        publishedAt: string | null;
        onboardingCompletedAt: string | null;
      };
    };

    assert.equal(firstData.profile.status, 'DRAFT');
    assert.equal(firstData.profile.publishedAt, null);
    assert.ok(firstData.profile.onboardingCompletedAt);

    const repeated = await request(
      '/api/freelancer/onboarding/complete',
      'POST',
      first,
    );

    assert.equal(repeated.status, 200);

    const repeatedData = await repeated.json() as {
      profile: { onboardingCompletedAt: string | null };
    };

    assert.equal(
      repeatedData.profile.onboardingCompletedAt,
      firstData.profile.onboardingCompletedAt,
    );
  });

  await t.test('preserves ownership and privacy', async () => {
    const otherResponse = await request(
      '/api/freelancer/profile',
      'GET',
      second,
    );

    assert.equal(otherResponse.status, 200);

    const otherData = await otherResponse.json() as {
      profile: {
        username: string;
        headline: string | null;
      };
    };

    assert.equal(otherData.profile.username, secondUsername);
    assert.equal(otherData.profile.headline, null);

    const publicResponse = await request(
      `/api/public/freelancers/${username}`,
    );

    assert.equal(publicResponse.status, 404);
  });
});
