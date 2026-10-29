
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const API_BASE =
  process.env.TEST_API_BASE_URL ??
  'http://localhost:5001';

const TEST_ORIGIN = new URL(API_BASE).origin;
  // Prevent accidental execution against a remote server.
const apiHost = new URL(API_BASE).hostname;

if (!['localhost', '127.0.0.1'].includes(apiHost)) {
  throw new Error('Integration tests require a local API.');
}

const REGISTER_URL = `${API_BASE}/api/auth/register`;
const LOGIN_URL = `${API_BASE}/api/auth/login`;

const email = `login-${randomUUID()}@example.com`;
const password = 'SecureTestPassword2026!';

interface ApiReply {
  message?: string;
  error?: string;
  user?: {
    id: string;
    email: string;
    displayName: string;
  };
}

async function post(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: TEST_ORIGIN,
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as ApiReply;

  return { response, data };
}

test('Login API integration tests', async (t) => {
  let invalidPasswordError: string | undefined;

  // Test 1: Create a fresh test account.
  await t.test('creates a test account', async () => {
    const { response, data } = await post(REGISTER_URL, {
      email,
      displayName: 'Login Test User',
      password,
    });

    assert.equal(response.status, 201);
    assert.equal(data.user?.email, email);
  });

  // Test 2: Successful login and secure cookie.
  await t.test('logs in and sets session cookie', async () => {
    const { response, data } = await post(LOGIN_URL, {
      email: `  ${email.toUpperCase()}  `,
      password,
    });

    assert.equal(response.status, 200);
    assert.equal(data.user?.email, email);
    assert.ok(data.user?.id);

    const cookie = response.headers.get('set-cookie');

    assert.ok(cookie, 'Session cookie must exist');
    assert.match(cookie, /^fp_session=[A-Za-z0-9_-]{43};/);
    assert.match(cookie, /;\s*HttpOnly(?:;|$)/i);
    assert.match(cookie, /;\s*SameSite=Lax(?:;|$)/i);
    assert.match(cookie, /;\s*Path=\/(?:;|$)/i);
    assert.match(cookie, /;\s*Max-Age=604800(?:;|$)/i);

    // Keep secrets out of the response JSON.
    const sessionToken = cookie.split(';')[0]!.split('=')[1]!;
    const responseText = JSON.stringify(data);

    assert.ok(!responseText.includes(sessionToken));
    assert.ok(!responseText.includes(password));
    assert.ok(!responseText.includes('passwordHash'));
    assert.ok(!responseText.includes('tokenHash'));
  });

  // Test 3: Incorrect password.
  await t.test('rejects incorrect password', async () => {
    const { response, data } = await post(LOGIN_URL, {
      email,
      password: 'IncorrectPassword2026!',
    });

    assert.equal(response.status, 401);
    assert.equal(
      data.error,
      'Invalid email or password.',
    );

    assert.equal(response.headers.get('set-cookie'), null);

    invalidPasswordError = data.error;
  });

  // Test 4: Unknown account receives identical error.
  await t.test('does not reveal unknown accounts', async () => {
    const { response, data } = await post(LOGIN_URL, {
      email: `missing-${randomUUID()}@example.com`,
      password,
    });

    assert.equal(response.status, 401);
    assert.equal(data.error, invalidPasswordError);
    assert.equal(response.headers.get('set-cookie'), null);
  });

  // Test 5: Invalid email syntax.
  await t.test('rejects invalid email', async () => {
    const { response } = await post(LOGIN_URL, {
      email: 'not-an-email',
      password,
    });

    assert.equal(response.status, 400);
  });

  // Test 6: Prevent mass assignment.
  await t.test('rejects unexpected fields', async () => {
    const { response } = await post(LOGIN_URL, {
      email,
      password,
      isAdmin: true,
    });

    assert.equal(response.status, 400);
  });

  // Test 7: Verify login rate limiting.
  // This must remain the last test.
  await t.test('enforces login rate limiting', async () => {
    let blocked = false;

    for (let i = 0; i < 12; i++) {
      const { response } = await post(LOGIN_URL, {});

      if (response.status === 429) {
        blocked = true;
        break;
      }

      assert.equal(response.status, 400);
    }

    assert.ok(blocked, 'Expected HTTP 429');
  });
});
