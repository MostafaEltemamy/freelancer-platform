
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const API_URL =
  process.env.TEST_API_URL ??
  'http://localhost:5001/api/auth/register';

const TEST_ORIGIN = new URL(API_URL).origin;
const testPassword = 'SecureTestPassword2026!';

async function register(payload: unknown) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: TEST_ORIGIN,
    },
    body: JSON.stringify(payload),
  });

  return {
    status: response.status,
    body: await response.text(),
  };
}

test('Registration API integration tests', async (t) => {
  const email = `api-${randomUUID()}@example.com`;

  // Test 1: Successful registration and normalization
  await t.test('creates a valid user securely', async () => {
    const result = await register({
      email: `  ${email.toUpperCase()}  `,
      displayName: '  Test API User  ',
      password: testPassword,
    });

    assert.equal(result.status, 201);

    const data = JSON.parse(result.body);

    assert.ok(data.user.id);
    assert.equal(data.user.email, email);
    assert.equal(data.user.displayName, 'Test API User');
    assert.ok(data.user.createdAt);

    // Sensitive credentials must never be returned.
    assert.equal(
      Object.hasOwn(data.user, 'passwordHash'),
      false,
    );

    assert.equal(
      Object.hasOwn(data.user, 'password'),
      false,
    );

    assert.ok(!result.body.includes(testPassword));
  });

  // Test 2: Duplicate email
  await t.test('rejects duplicate email', async () => {
    const result = await register({
      email,
      displayName: 'Another User',
      password: testPassword,
    });

    assert.equal(result.status, 409);
  });

  // Test 3: Invalid input
  await t.test('rejects invalid email', async () => {
    const result = await register({
      email: 'invalid-email',
      displayName: 'Test User',
      password: testPassword,
    });

    assert.equal(result.status, 400);
  });

  // Test 4: Unexpected fields
  await t.test('rejects unexpected fields', async () => {
    const result = await register({
      email: `extra-${randomUUID()}@example.com`,
      displayName: 'Test User',
      password: testPassword,
      isAdmin: true,
    });

    assert.equal(result.status, 400);
  });

  // Test 5: Concurrent registration
  await t.test(
    'prevents concurrent duplicate registrations',
    async () => {
      const concurrentEmail =
        `concurrent-${randomUUID()}@example.com`;

      const payload = {
        email: concurrentEmail,
        displayName: 'Concurrent User',
        password: testPassword,
      };

      const results = await Promise.all([
        register(payload),
        register(payload),
      ]);

      const statuses = results
        .map((result) => result.status)
        .sort((a, b) => a - b);

      assert.deepEqual(statuses, [201, 409]);
    },
  );

  // Test 6: Rate limiting
  // Keep this last: it intentionally exhausts the limit.
  await t.test('enforces registration rate limit', async () => {
    let blocked = false;

    for (let i = 0; i < 12; i++) {
      const result = await register({});

      if (result.status === 429) {
        blocked = true;
        break;
      }

      assert.equal(result.status, 400);
    }

    assert.equal(
      blocked,
      true,
      'Expected the API to return HTTP 429',
    );
  });
});
