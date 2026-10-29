
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';

const API_BASE =
  process.env.TEST_API_BASE_URL ??
  'http://localhost:5001';

const apiUrl = new URL(API_BASE);
const TEST_ORIGIN = apiUrl.origin;
const csrfTokens = new Map<string, string>();

if (
  !['localhost', '127.0.0.1'].includes(apiUrl.hostname)
) {
  throw new Error('Tests require a local API.');
}

const email = `logout-${randomUUID()}@example.com`;
const password = 'SecureTestPassword2026!';

async function postJson(
  path: string,
  payload: unknown,
) {
  return fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: TEST_ORIGIN,
    },
    body: JSON.stringify(payload),
  });
}

async function login(): Promise<string> {
  const response = await postJson('/api/auth/login', {
    email,
    password,
  });

  assert.equal(response.status, 200);

  const setCookie = response.headers.get('set-cookie');

  assert.ok(setCookie, 'Expected session cookie');

const cookie = setCookie.split(';', 1)[0];

assert.ok(cookie, 'Expected a valid session cookie');

assert.match(cookie, /^fp_session=[A-Za-z0-9_-]{43}$/);

const csrfResponse = await fetch(
  `${API_BASE}/api/auth/csrf`,
  {
    headers: {
      Cookie: cookie,
    },
  },
);

assert.equal(csrfResponse.status, 200);

const csrfData = await csrfResponse.json() as {
  csrfToken: string;
};

assert.match(csrfData.csrfToken, /^[a-f0-9]{64}$/);

csrfTokens.set(cookie, csrfData.csrfToken);

return cookie;

}

async function getMe(cookie: string) {
  return fetch(`${API_BASE}/api/auth/me`, {
    headers: {
      Cookie: cookie,
    },
  });
}

async function logout(cookie?: string) {
  const csrfToken = cookie
    ? csrfTokens.get(cookie)
    : undefined;

  return fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    headers: {
      Origin: TEST_ORIGIN,

      ...(cookie
        ? { Cookie: cookie }
        : {}),

      ...(csrfToken
        ? { 'X-CSRF-Token': csrfToken }
        : {}),
    },
  });
}

test('Logout API integration tests', async (t) => {
  let firstCookie: string;
  let secondCookie: string;

  await t.test('creates a test account', async () => {
    const response = await postJson('/api/auth/register', {
      email,
      displayName: 'Logout Test User',
      password,
    });

    assert.equal(response.status, 201);
  });

  await t.test('creates two independent sessions', async () => {
    firstCookie = await login();
    secondCookie = await login();

    assert.notEqual(firstCookie, secondCookie);
  });

  await t.test('both sessions authenticate', async () => {
    const first = await getMe(firstCookie);
    const second = await getMe(secondCookie);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
  });

  await t.test('logout clears the session cookie', async () => {
    const response = await logout(firstCookie);

    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');

    const clearedCookie =
      response.headers.get('set-cookie');

    assert.ok(clearedCookie);

    assert.match(
      clearedCookie,
      /^fp_session=;/,
    );

    assert.match(clearedCookie, /expires=/i);
    assert.match(clearedCookie, /httponly/i);
    assert.match(clearedCookie, /samesite=lax/i);
  });

  await t.test('revoked session cannot be reused', async () => {
    const response = await getMe(firstCookie);

    assert.equal(response.status, 401);
  });

  await t.test('another session remains active', async () => {
    const response = await getMe(secondCookie);

    assert.equal(response.status, 200);
  });

  await t.test('repeated logout is safe', async () => {
    const response = await logout(firstCookie);

    assert.equal(response.status, 204);
  });

  await t.test('logout without a cookie is safe', async () => {
    const response = await logout();

    assert.equal(response.status, 204);
  });

  await t.test('forged logout token cannot revoke another session', async () => {
    const forgedToken = randomBytes(32)
      .toString('base64url');

    const response = await logout(
      `fp_session=${forgedToken}`,
    );

    assert.equal(response.status, 403);

    const stillValid = await getMe(secondCookie);

    assert.equal(stillValid.status, 200);
  });
});
