import 'dotenv/config';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import { prisma } from '../src/database/prisma.js';

const API_BASE =
  process.env.TEST_API_BASE_URL ??
  'http://localhost:5001';

const origin = new URL(API_BASE).origin;
const databaseUrl = process.env.DATABASE_URL;

if (
  !['localhost', '127.0.0.1'].includes(
    new URL(API_BASE).hostname,
  ) ||
  !databaseUrl ||
  !['localhost', '127.0.0.1'].includes(
    new URL(databaseUrl).hostname,
  )
) {
  throw new Error(
    'Username tests require a local API and local database.',
  );
}

const unique = randomUUID().replace(/-/g, '');
const username = `dev_${unique.slice(0, 14)}`;
const password = 'SecureTestPassword2026!';

const createdUserIds: string[] = [];

interface TestSession {
  cookie: string;
  csrf: string;
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

async function createSession(
  label: string,
): Promise<TestSession> {
  const email = `${label}-${unique}@example.com`;

  const registration = await fetch(
    `${API_BASE}/api/auth/register`,
    {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        displayName: `Test ${label}`,
        password,
      }),
    },
  );

  assert.equal(registration.status, 201);

  const registrationData = await registration.json() as {
    user: { id: string };
  };

  createdUserIds.push(registrationData.user.id);

  const login = await fetch(
    `${API_BASE}/api/auth/login`,
    {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    },
  );

  assert.equal(login.status, 200);

  const setCookie = login.headers.get('set-cookie');
  assert.ok(setCookie);

  const cookie = setCookie.split(';', 1)[0];
  assert.ok(cookie);

  const csrfResponse = await fetch(
    `${API_BASE}/api/auth/csrf`,
    {
      headers: { Cookie: cookie },
    },
  );

  assert.equal(csrfResponse.status, 200);

  const data = await csrfResponse.json() as {
    csrfToken: string;
  };

  assert.match(data.csrfToken, /^[a-f0-9]{64}$/);

  return {
    cookie,
    csrf: data.csrfToken,
  };
}

async function claim(
  session: TestSession,
  candidate: string,
  includeCsrf = true,
) {
  return fetch(`${API_BASE}/api/freelancer/username`, {
    method: 'POST',
    headers: {
      Origin: origin,
      Cookie: session.cookie,
      'Content-Type': 'application/json',
      ...(includeCsrf
        ? { 'X-CSRF-Token': session.csrf }
        : {}),
    },
    body: JSON.stringify({ username: candidate }),
  });
}

async function availability(candidate: string) {
  const response = await fetch(
    `${API_BASE}/api/freelancer/usernames/${candidate}/availability`,
  );

  return {
    status: response.status,
    data: await response.json() as {
      username?: string;
      available?: boolean;
    },
  };
}

test('Freelancer username API integration tests', async (t) => {
  let first!: TestSession;
  let second!: TestSession;
  let winner!: TestSession;

  await t.test('creates two authenticated accounts', async () => {
    first = await createSession('first');
    second = await createSession('second');

    assert.notEqual(first.cookie, second.cookie);
  });

  await t.test('new username is available', async () => {
    const result = await availability(username);

    assert.equal(result.status, 200);
    assert.equal(result.data.available, true);
  });

  await t.test('reserved username is unavailable', async () => {
    const result = await availability('ADMIN');

    assert.equal(result.status, 200);
    assert.equal(result.data.available, false);
  });

  await t.test('rejects unauthenticated reservation', async () => {
    const response = await fetch(
      `${API_BASE}/api/freelancer/username`,
      {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
      },
    );

    assert.equal(response.status, 401);
  });

  await t.test('requires a valid CSRF token', async () => {
    const response = await claim(first, username, false);

    assert.equal(response.status, 403);
  });

  await t.test('rejects invalid usernames', async () => {
    const response = await claim(first, 'not.valid');

    assert.equal(response.status, 400);
  });

  await t.test('prevents concurrent duplicate claims', async () => {
    const responses = await Promise.all([
      claim(first, username.toUpperCase()),
      claim(second, username),
    ]);

    const statuses = responses
      .map((response) => response.status)
      .sort((a, b) => a - b);

    assert.deepEqual(statuses, [201, 409]);

    winner = responses[0]!.status === 201
      ? first
      : second;
  });

  await t.test('allows idempotent reservation', async () => {
    const response = await claim(winner, username);

    assert.equal(response.status, 200);

    const data = await response.json() as {
      username: string;
      profilePath: string;
    };

    assert.equal(data.username, username);
    assert.equal(data.profilePath, `/u/${username}`);
  });

  await t.test('does not permit username reassignment', async () => {
    const response = await claim(
      winner,
      `other_${unique.slice(0, 14)}`,
    );

    assert.equal(response.status, 409);
  });

  await t.test('reserved username becomes unavailable', async () => {
    const result = await availability(username);

    assert.equal(result.data.available, false);
  });

  await t.test('draft profile is not public', async () => {
    const response = await fetch(
      `${API_BASE}/api/public/freelancers/${username}`,
    );

    assert.equal(response.status, 404);
  });

  await t.test('authenticated sessions remain valid', async () => {
    const responses = await Promise.all([
      fetch(`${API_BASE}/api/auth/me`, {
        headers: { Cookie: first.cookie },
      }),
      fetch(`${API_BASE}/api/auth/me`, {
        headers: { Cookie: second.cookie },
      }),
    ]);

    assert.deepEqual(
      responses.map((response) => response.status),
      [200, 200],
    );
  });
});
