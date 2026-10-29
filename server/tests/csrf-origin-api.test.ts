
import assert from 'node:assert/strict';
import { test } from 'node:test';

const API_BASE =
  process.env.TEST_API_BASE_URL ??
  'http://localhost:5001';

const apiUrl = new URL(API_BASE);

if (!['localhost', '127.0.0.1'].includes(apiUrl.hostname)) {
  throw new Error('Tests require a local API.');
}

const LOGOUT_URL = `${API_BASE}/api/auth/logout`;

async function logoutWithHeaders(
  headers: Record<string, string>,
) {
  return fetch(LOGOUT_URL, {
    method: 'POST',
    headers,
  });
}

test('CSRF origin protection integration tests', async (t) => {
  await t.test('allows a trusted origin', async () => {
    const response = await logoutWithHeaders({
      Origin: apiUrl.origin,
    });

    assert.equal(response.status, 204);
  });

  await t.test('rejects an untrusted origin', async () => {
    const response = await logoutWithHeaders({
      Origin: 'https://attacker.example',
    });

    assert.equal(response.status, 403);
  });

  await t.test('rejects requests without origin information', async () => {
    const response = await logoutWithHeaders({});

    assert.equal(response.status, 403);
  });

  await t.test('rejects null origins', async () => {
    const response = await logoutWithHeaders({
      Origin: 'null',
    });

    assert.equal(response.status, 403);
  });

  await t.test('rejects deceptive origin prefixes', async () => {
    const response = await logoutWithHeaders({
      Origin: 'http://localhost:5001.attacker.example',
    });

    assert.equal(response.status, 403);
  });

  await t.test('accepts a trusted Referer fallback', async () => {
    const response = await logoutWithHeaders({
      Referer: `${apiUrl.origin}/dashboard`,
    });

    assert.equal(response.status, 204);
  });

  await t.test('allows safe GET requests', async () => {
    const response = await fetch(
      `${API_BASE}/api/auth/me`,
    );

    // No session, but origin protection should not block GET.
    assert.equal(response.status, 401);
  });
});
