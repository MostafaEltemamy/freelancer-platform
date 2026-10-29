
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';

const API_BASE =
  process.env.TEST_API_BASE_URL ??
  'http://localhost:5001';

const TEST_ORIGIN = new URL(API_BASE).origin;

  if (
  !['localhost', '127.0.0.1'].includes(
    new URL(API_BASE).hostname,
  )
) {
  throw new Error('Tests require a local API.');
}

const email = `session-${randomUUID()}@example.com`;
const password = 'SecureTestPassword2026!';

test('Session authentication integration tests', async (t) => {
  let sessionCookie: string | undefined;

  await t.test('rejects requests without a cookie', async () => {
    const response = await fetch(`${API_BASE}/api/auth/me`);

    assert.equal(response.status, 401);
  });

  await t.test('creates a test account', async () => {
    const response = await fetch(
      `${API_BASE}/api/auth/register`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: TEST_ORIGIN,
        },
        body: JSON.stringify({
          email,
          displayName: 'Session Test User',
          password,
        }),
      },
    );

    assert.equal(response.status, 201);
  });

  await t.test('logs in and receives a session', async () => {
    const response = await fetch(
      `${API_BASE}/api/auth/login`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: TEST_ORIGIN,
        },
        body: JSON.stringify({
          email,
          password,
        }),
      },
    );

    assert.equal(response.status, 200);

    const setCookie = response.headers.get('set-cookie');

    assert.ok(setCookie);

    sessionCookie = setCookie.split(';', 1)[0];

    assert.ok(sessionCookie?.startsWith('fp_session='));
  });

  await t.test('accepts a valid session', async () => {
    assert.ok(sessionCookie);

    const response = await fetch(
      `${API_BASE}/api/auth/me`,
      {
        headers: {
          Cookie: sessionCookie,
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('cache-control'),
      'no-store',
    );

    const data = await response.json() as {
      user: {
        id: string;
        email: string;
        displayName: string;
      };
    };

    assert.ok(data.user.id);
    assert.equal(data.user.email, email);
    assert.equal(
      data.user.displayName,
      'Session Test User',
    );

    const output = JSON.stringify(data);

    assert.ok(!output.includes(password));
    assert.ok(!output.includes('passwordHash'));
    assert.ok(!output.includes('tokenHash'));
  });

  await t.test('rejects forged session tokens', async () => {
    const forgedToken = randomBytes(32)
      .toString('base64url');

    const response = await fetch(
      `${API_BASE}/api/auth/me`,
      {
        headers: {
          Cookie: `fp_session=${forgedToken}`,
        },
      },
    );

    assert.equal(response.status, 401);
  });

  await t.test('rejects malformed tokens', async () => {
    const response = await fetch(
      `${API_BASE}/api/auth/me`,
      {
        headers: {
          Cookie: 'fp_session=invalid-token',
        },
      },
    );

    assert.equal(response.status, 401);
  });

  await t.test('ignores unrelated cookies', async () => {
    const response = await fetch(
      `${API_BASE}/api/auth/me`,
      {
        headers: {
          Cookie: 'other_cookie=random-value',
        },
      },
    );

    assert.equal(response.status, 401);
  });
});
