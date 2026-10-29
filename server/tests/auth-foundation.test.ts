import assert from 'node:assert/strict';
import { test } from 'node:test';

import { registrationSchema } from '../src/modules/auth/auth.schemas.js';
import {
  hashPassword,
  verifyPassword,
} from '../src/modules/auth/password.js';

const validInput = {
  email: '  Freelancer@Example.com  ',
  displayName: '  Test Freelancer  ',
  password: 'a long example passphrase',
};

test('registration normalizes email and display name', () => {
  const result = registrationSchema.parse(validInput);

  assert.equal(result.email, 'freelancer@example.com');
  assert.equal(result.displayName, 'Test Freelancer');
});

test('registration preserves the exact password', () => {
  const password = '  My Long Passphrase  ';
  const result = registrationSchema.parse({
    ...validInput,
    password,
  });

  assert.equal(result.password, password);
});

test('registration rejects invalid fields', () => {
  const invalidInputs = [
    { ...validInput, email: 'not-an-email' },
    { ...validInput, displayName: '   ' },
    { ...validInput, password: 'short' },
    { ...validInput, password: 'x'.repeat(129) },
    { ...validInput, displayName: 'x'.repeat(121) },
  ];

  for (const input of invalidInputs) {
    assert.equal(registrationSchema.safeParse(input).success, false);
  }
});

test('registration rejects unexpected privileged fields', () => {
  const result = registrationSchema.safeParse({
    ...validInput,
    role: 'ADMIN',
  });

  assert.equal(result.success, false);
});

test('password hash accepts the correct password and rejects another', async () => {
  const password = 'a long example passphrase';
  const hash = await hashPassword(password);

  assert.match(hash, /^\$argon2id\$/);
  assert.notEqual(hash, password);
  assert.equal(await verifyPassword(hash, password), true);
  assert.equal(await verifyPassword(hash, 'a different passphrase'), false);
});

test('hashing the same password produces different salted hashes', async () => {
  const password = 'a long example passphrase';

  const firstHash = await hashPassword(password);
  const secondHash = await hashPassword(password);

  assert.notEqual(firstHash, secondHash);
  assert.equal(await verifyPassword(firstHash, password), true);
  assert.equal(await verifyPassword(secondHash, password), true);
});