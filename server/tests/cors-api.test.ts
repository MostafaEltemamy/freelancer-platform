
import assert from 'node:assert/strict';
import { test } from 'node:test';

const API_BASE =
  process.env.TEST_API_BASE_URL ??
  'http://localhost:5001';

const hostname = new URL(API_BASE).hostname;

if (!['localhost', '127.0.0.1'].includes(hostname)) {
  throw new Error('Tests require a local API.');
}

const TRUSTED_ORIGIN = 'http://localhost:5173';
const UNTRUSTED_ORIGIN = 'https://attacker.example';

const ME_URL = `${API_BASE}/api/auth/me`;
const LOGOUT_URL = `${API_BASE}/api/auth/logout`;

test('CORS security integration tests', async (t) => {
  await t.test('allows trusted frontend origin', async () => {
    const response = await fetch(ME_URL, {
      headers: { Origin: TRUSTED_ORIGIN },
    });

    // Authentication is still required.
    assert.equal(response.status, 401);

    assert.equal(
      response.headers.get('access-control-allow-origin'),
      TRUSTED_ORIGIN,
    );

    assert.equal(
      response.headers.get('access-control-allow-credentials'),
      'true',
    );
  });

  await t.test('does not allow untrusted origin', async () => {
    const response = await fetch(ME_URL, {
      headers: { Origin: UNTRUSTED_ORIGIN },
    });

    assert.equal(response.status, 401);

    assert.equal(
      response.headers.get('access-control-allow-origin'),
      null,
    );
  });

  await t.test('does not grant CORS without Origin', async () => {
    const response = await fetch(ME_URL);

    assert.equal(response.status, 401);

    assert.equal(
      response.headers.get('access-control-allow-origin'),
      null,
    );
  });

  await t.test('allows trusted preflight', async () => {
    const response = await fetch(LOGOUT_URL, {
      method: 'OPTIONS',
      headers: {
        Origin: TRUSTED_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers':
          'content-type,x-csrf-token',
      },
    });

    assert.equal(response.status, 204);

    assert.equal(
      response.headers.get('access-control-allow-origin'),
      TRUSTED_ORIGIN,
    );

    assert.equal(
      response.headers.get('access-control-allow-credentials'),
      'true',
    );

    const allowedHeaders =
      response.headers
        .get('access-control-allow-headers')
        ?.toLowerCase() ?? '';

    assert.ok(allowedHeaders.includes('x-csrf-token'));
    assert.ok(allowedHeaders.includes('content-type'));
  });

  await t.test('does not allow untrusted preflight', async () => {
    const response = await fetch(LOGOUT_URL, {
      method: 'OPTIONS',
      headers: {
        Origin: UNTRUSTED_ORIGIN,
        'Access-Control-Request-Method': 'POST',
      },
    });

    assert.equal(
      response.headers.get('access-control-allow-origin'),
      null,
    );
  });

  await t.test('rejects deceptive origin prefixes', async () => {
    const response = await fetch(ME_URL, {
      headers: {
        Origin: 'http://localhost:5173.attacker.example',
      },
    });

    assert.equal(
      response.headers.get('access-control-allow-origin'),
      null,
    );
  });

  await t.test('allows trusted logout without a session', async () => {
    const response = await fetch(LOGOUT_URL, {
      method: 'POST',
      headers: { Origin: TRUSTED_ORIGIN },
    });

    assert.equal(response.status, 204);
  });

  await t.test('rejects untrusted state changes', async () => {
    const response = await fetch(LOGOUT_URL, {
      method: 'POST',
      headers: { Origin: UNTRUSTED_ORIGIN },
    });

    assert.equal(response.status, 403);
  });
});
