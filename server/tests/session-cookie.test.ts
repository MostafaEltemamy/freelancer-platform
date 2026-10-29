
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_COOKIE_CLEAR_OPTIONS,
  SESSION_TTL_MS,
} from '../src/modules/auth/session-cookie.js';

test('session expiration is seven days', () => {
  assert.equal(SESSION_TTL_MS, 604800000);

  assert.equal(
    SESSION_COOKIE_OPTIONS.maxAge,
    SESSION_TTL_MS,
  );
});

test('session cookies are HttpOnly', () => {
  assert.equal(SESSION_COOKIE_OPTIONS.httpOnly, true);
});

test('session cookie uses SameSite Lax', () => {
  assert.equal(SESSION_COOKIE_OPTIONS.sameSite, 'lax');
});

test('session cookie is restricted to root path', () => {
  assert.equal(SESSION_COOKIE_OPTIONS.path, '/');
  assert.equal(SESSION_COOKIE_OPTIONS.domain, undefined);
});

test('production cookies use secure prefix', () => {
  const isProduction =
    process.env.NODE_ENV === 'production';

  assert.equal(
    SESSION_COOKIE_NAME,
    isProduction ? '__Host-fp_session' : 'fp_session',
  );

  assert.equal(
    SESSION_COOKIE_OPTIONS.secure,
    isProduction,
  );
});

test('cookie clearing uses matching security settings', () => {
  assert.equal(
    SESSION_COOKIE_CLEAR_OPTIONS.httpOnly,
    SESSION_COOKIE_OPTIONS.httpOnly,
  );

  assert.equal(
    SESSION_COOKIE_CLEAR_OPTIONS.secure,
    SESSION_COOKIE_OPTIONS.secure,
  );

  assert.equal(
    SESSION_COOKIE_CLEAR_OPTIONS.sameSite,
    SESSION_COOKIE_OPTIONS.sameSite,
  );

  assert.equal(
    SESSION_COOKIE_CLEAR_OPTIONS.path,
    SESSION_COOKIE_OPTIONS.path,
  );

  assert.equal(
    SESSION_COOKIE_CLEAR_OPTIONS.maxAge,
    undefined,
  );

  assert.equal(
    SESSION_COOKIE_CLEAR_OPTIONS.expires,
    undefined,
  );
});
