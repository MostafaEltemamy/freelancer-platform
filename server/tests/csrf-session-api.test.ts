
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const API_BASE =
  process.env.TEST_API_BASE_URL ??
  'http://localhost:5001';

const origin = new URL(API_BASE).origin;

if (
  !['localhost', '127.0.0.1'].includes(
    new URL(API_BASE).hostname,
  )
) {
  throw new Error('Tests require a local API.');
}

const email = `csrf-${randomUUID()}@example.com`;
const password = 'SecureTestPassword2026!';

type SessionInfo = {
  cookie: string;
  csrfToken: string;
};

async function login(): Promise<SessionInfo> {
  const response = await fetch(
    `${API_BASE}/api/auth/login`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
      },
      body: JSON.stringify({ email, password }),
    },
  );

  assert.equal(response.status, 200);

  const setCookie = response.headers.get('set-cookie');
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
  assert.equal(
    csrfResponse.headers.get('cache-control'),
    'no-store',
  );

  const data = await csrfResponse.json() as {
    csrfToken: string;
  };

  assert.match(data.csrfToken, /^[a-f0-9]{64}$/);

  return {
    cookie,
    csrfToken: data.csrfToken,
  };
}

async function logout(
  cookie: string,
  csrfToken?: string,
) {
  return fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    headers: {
      Origin: origin,
      Cookie: cookie,
      ...(csrfToken
        ? { 'X-CSRF-Token': csrfToken }
        : {}),
    },
  });
}

async function getMe(cookie: string) {
  return fetch(`${API_BASE}/api/auth/me`, {
    headers: { Cookie: cookie },
  });
}

test('Session-bound CSRF integration tests', async (t) => {
  let first!: SessionInfo;
  let second!: SessionInfo;

  await t.test('requires authentication for CSRF token', async () => {
    const response = await fetch(
      `${API_BASE}/api/auth/csrf`,
    );

    assert.equal(response.status, 401);
  });

  await t.test('creates a test account', async () => {
    const response = await fetch(
      `${API_BASE}/api/auth/register`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: origin,
        },
        body: JSON.stringify({
          email,
          displayName: 'CSRF Test User',
          password,
        }),
      },
    );

    assert.equal(response.status, 201);
  });

  await t.test('generates session-specific CSRF tokens', async () => {
    first = await login();
    second = await login();

    assert.notEqual(first.cookie, second.cookie);
    assert.notEqual(first.csrfToken, second.csrfToken);
  });

  await t.test('rejects logout without a CSRF token', async () => {
    const response = await logout(first.cookie);

    assert.equal(response.status, 403);
    assert.equal((await getMe(first.cookie)).status, 200);
  });

  await t.test('rejects another session CSRF token', async () => {
    const response = await logout(
      second.cookie,
      first.csrfToken,
    );

    assert.equal(response.status, 403);
    assert.equal((await getMe(second.cookie)).status, 200);
  });

  await t.test('rejects forged CSRF tokens', async () => {
    const response = await logout(
      first.cookie,
      '0'.repeat(64),
    );

    assert.equal(response.status, 403);
  });

  await t.test('accepts correct CSRF token and revokes session', async () => {
    const response = await logout(
      first.cookie,
      first.csrfToken,
    );

    assert.equal(response.status, 204);
    assert.equal((await getMe(first.cookie)).status, 401);
  });

  await t.test('preserves another independent session', async () => {
    assert.equal((await getMe(second.cookie)).status, 200);

    const response = await logout(
      second.cookie,
      second.csrfToken,
    );

    assert.equal(response.status, 204);
  });
});
