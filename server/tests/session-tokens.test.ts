
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/auth/session-tokens.js';

test('generates a secure session token', () => {
  const { token, tokenHash } = generateSessionToken();

  assert.equal(token.length, 43);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);

  assert.equal(tokenHash.length, 64);
  assert.match(tokenHash, /^[a-f0-9]{64}$/);
});

test('stores a hash instead of the raw token', () => {
  const { token, tokenHash } = generateSessionToken();

  assert.notEqual(token, tokenHash);
  assert.equal(hashSessionToken(token), tokenHash);
});

test('different sessions have different tokens', () => {
  const first = generateSessionToken();
  const second = generateSessionToken();

  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenHash, second.tokenHash);
});

test('different tokens produce different hashes', () => {
  const first = generateSessionToken();
  const second = generateSessionToken();

  assert.notEqual(
    hashSessionToken(first.token),
    hashSessionToken(second.token),
  );
});
