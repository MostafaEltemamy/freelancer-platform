import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertProductionConfiguration} from '../src/config/production-preflight.js';

function validConfiguration():
  Record<string, string | undefined> {
  return {
    NODE_ENV: 'production',

    DATABASE_URL:
      'postgresql://example:example@db.internal:5432/freelancer',

    CSRF_SECRET:
      Buffer.alloc(32, 7).toString('base64url'),

    CSRF_ALLOWED_ORIGINS:
      'https://freelancer.example.com,' +
      'https://api.freelancer.example.com',

    S3_BUCKET: 'freelancer-media-prod',
    S3_REGION: 'auto',

    S3_ENDPOINT:
      'https://0123456789abcdef0123456789abcdef' +
      '.r2.cloudflarestorage.com',

    S3_ACCESS_KEY_ID: 'example-app-key',
    S3_SECRET_ACCESS_KEY: 'example-app-secret',
  };
}

test('allows a valid production configuration', () => {
  assert.doesNotThrow(() => {
    assertProductionConfiguration(
      validConfiguration(),
    );
  });
});

test('does not interfere with development', () => {
  assert.doesNotThrow(() => {
    assertProductionConfiguration({
      NODE_ENV: 'development',
    });
  });
});

test('rejects missing storage credentials', () => {
  const config = validConfiguration();

  delete config.S3_ACCESS_KEY_ID;
  delete config.S3_SECRET_ACCESS_KEY;

  assert.throws(
    () => assertProductionConfiguration(config),
    /S3_ACCESS_KEY_ID/,
  );

  assert.throws(
    () => assertProductionConfiguration(config),
    /S3_SECRET_ACCESS_KEY/,
  );
});

test('rejects the development R2 bucket', () => {
  const config = validConfiguration();

  config.S3_BUCKET = 'freelancer-media-dev';

  assert.throws(
    () => assertProductionConfiguration(config),
    /S3_BUCKET/,
  );
});

test('rejects insecure frontend origins', () => {
  const config = validConfiguration();

  config.CSRF_ALLOWED_ORIGINS =
    'http://localhost:5173';

  assert.throws(
    () => assertProductionConfiguration(config),
    /CSRF_ALLOWED_ORIGINS/,
  );
});

test('rejects an invalid CSRF secret', () => {
  const config = validConfiguration();

  config.CSRF_SECRET = 'not-a-valid-secret';

  assert.throws(
    () => assertProductionConfiguration(config),
    /CSRF_SECRET/,
  );
});

test('rejects an untrusted R2 endpoint', () => {
  const config = validConfiguration();

  config.S3_ENDPOINT =
    'https://account.r2.cloudflarestorage.com.attacker.example';

  assert.throws(
    () => assertProductionConfiguration(config),
    /S3_ENDPOINT/,
  );
});

test('rejects shared app and audit credentials', () => {
  const config = validConfiguration();

  config.R2_AUDIT_ACCESS_KEY_ID =
    config.S3_ACCESS_KEY_ID;

  assert.throws(
    () => assertProductionConfiguration(config),
    /R2_AUDIT_ACCESS_KEY_ID/,
  );
});

test('never prints secret values in errors', () => {
  const config = validConfiguration();

  config.S3_BUCKET = 'freelancer-media-dev';
  config.S3_SECRET_ACCESS_KEY =
    'sensitive-example-value';

  assert.throws(
    () => assertProductionConfiguration(config),
    (error: unknown) => {
      assert.ok(error instanceof Error);

      assert.equal(
        error.message.includes(
          'sensitive-example-value',
        ),
        false,
      );

      return true;
    },
  );
});
