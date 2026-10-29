
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

const API_BASE =
  process.env.TEST_API_BASE_URL ??
  'http://localhost:5001';

const apiUrl = new URL(API_BASE);

// Prevent accidental testing against remote servers.
if (
  !['localhost', '127.0.0.1'].includes(apiUrl.hostname)
) {
  throw new Error('Tests require a local API.');
}

const TRUSTED_ORIGIN = apiUrl.origin;
const ATTACKER_ORIGIN = 'https://attacker.example';

const ME_URL = `${API_BASE}/api/auth/me`;
const CSRF_URL = `${API_BASE}/api/auth/csrf`;
const LOGOUT_URL = `${API_BASE}/api/auth/logout`;

test('Authentication security regression tests', async (t) => {

  // Test 1: Unauthenticated profile access.
  await t.test(
    'rejects unauthenticated profile requests',
    async () => {
      const response = await fetch(ME_URL);

      assert.equal(response.status, 401);

      assert.equal(
        response.headers.get('cache-control'),
        'no-store',
      );
    },
  );

  // Test 2: CSRF tokens require authentication.
  await t.test(
    'does not expose CSRF tokens without authentication',
    async () => {
      const response = await fetch(CSRF_URL);

      assert.equal(response.status, 401);

      const body = await response.text();

      assert.ok(!body.includes('csrfToken'));

      assert.equal(
        response.headers.get('cache-control'),
        'no-store',
      );
    },
  );

  // Test 3: Protective HTTP response headers.
  await t.test(
    'sends protective HTTP security headers',
    async () => {
      const response = await fetch(ME_URL);

      assert.equal(
        response.headers.get('x-content-type-options'),
        'nosniff',
      );

      assert.ok(
        response.headers.get('x-frame-options'),
      );

      assert.ok(
        response.headers.get('referrer-policy'),
      );

      assert.equal(
        response.headers.get('x-powered-by'),
        null,
      );
    },
  );

  // Test 4: Logout responses must not be cached.
  await t.test(
    'prevents caching of logout responses',
    async () => {
      const response = await fetch(LOGOUT_URL, {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
        },
      });

      assert.equal(response.status, 204);

      assert.equal(
        response.headers.get('cache-control'),
        'no-store',
      );
    },
  );

  // Test 5: Untrusted Origin overrides trusted Referer.
  await t.test(
    'rejects untrusted Origin even with trusted Referer',
    async () => {
      const response = await fetch(LOGOUT_URL, {
        method: 'POST',
        headers: {
          Origin: ATTACKER_ORIGIN,
          Referer: `${TRUSTED_ORIGIN}/dashboard`,
        },
      });

      assert.equal(response.status, 403);
    },
  );

  // Test 6: Missing origin information.
  await t.test(
    'rejects unsafe requests without origin information',
    async () => {
      const response = await fetch(LOGOUT_URL, {
        method: 'POST',
      });

      assert.equal(response.status, 403);
    },
  );

  // Test 7: Forged cookie without CSRF token.
  await t.test(
    'rejects forged logout sessions without CSRF',
    async () => {
      const forgedToken = randomBytes(32)
        .toString('base64url');

      const response = await fetch(LOGOUT_URL, {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: `fp_session=${forgedToken}`,
        },
      });

      assert.equal(response.status, 403);
    },
  );

  // Test 8: Do not expose responses to untrusted origins.
  await t.test(
    'does not grant credentialed CORS to attackers',
    async () => {
      const response = await fetch(ME_URL, {
        headers: {
          Origin: ATTACKER_ORIGIN,
        },
      });

      assert.equal(response.status, 401);

      assert.equal(
        response.headers.get(
          'access-control-allow-origin',
        ),
        null,
      );
    },
  );
});
