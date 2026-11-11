import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertDeploymentIsolation} from '../src/config/deployment-isolation.js';

type TestConfig = Record<
  string,
  string | undefined
> & {
  NODE_ENV: string;
  DEPLOYMENT_ENV?: string;
  DATABASE_URL: string;
  S3_BUCKET: string;
  SHADOW_DATABASE_URL?: string;
};

function staging(): TestConfig {
  return {
    NODE_ENV: 'production',
    DEPLOYMENT_ENV: 'staging',

    DATABASE_URL:
      'postgresql://freelancer_staging_runtime:' +
      'test-password@db.example.internal:5432/' +
      'freelancer_staging?schema=public',

    S3_BUCKET: 'freelancer-media-staging',
  };
}

function production(): TestConfig {
  return {
    NODE_ENV: 'production',
    DEPLOYMENT_ENV: 'production',

    DATABASE_URL:
      'postgresql://freelancer_prod_runtime:' +
      'test-password@db.example.internal:5432/' +
      'freelancer_prod?schema=public',

    S3_BUCKET: 'freelancer-media-prod',
  };
}

test('allows local development', () => {
  assert.doesNotThrow(() => {
    assertDeploymentIsolation({
      NODE_ENV: 'development',
      DEPLOYMENT_ENV: 'development',
    });
  });
});

test('allows development without deployment flag', () => {
  assert.doesNotThrow(() => {
    assertDeploymentIsolation({
      NODE_ENV: 'development',
    });
  });
});

test('accepts isolated staging configuration', () => {
  assert.doesNotThrow(() => {
    assertDeploymentIsolation(staging());
  });
});

test('accepts isolated production configuration', () => {
  assert.doesNotThrow(() => {
    assertDeploymentIsolation(production());
  });
});

test('rejects staging with development bucket', () => {
  const config = staging();

  config.S3_BUCKET = 'freelancer-media-dev';

  assert.throws(
    () => assertDeploymentIsolation(config),
    /S3_BUCKET/,
  );
});

test('rejects staging with production bucket', () => {
  const config = staging();

  config.S3_BUCKET = 'freelancer-media-prod';

  assert.throws(
    () => assertDeploymentIsolation(config),
    /S3_BUCKET/,
  );
});

test('rejects staging using production database', () => {
  const config = staging();

  config.DATABASE_URL =
    production().DATABASE_URL;

  assert.throws(
    () => assertDeploymentIsolation(config),
    /DATABASE_URL/,
  );
});

test('rejects production using staging database', () => {
  const config = production();

  config.DATABASE_URL =
    staging().DATABASE_URL;

  assert.throws(
    () => assertDeploymentIsolation(config),
    /DATABASE_URL/,
  );
});

test('rejects a privileged migration role', () => {
  const config = staging();

  config.DATABASE_URL =
    config.DATABASE_URL.replace(
      'freelancer_staging_runtime',
      'freelancer_staging_migrator',
    );

  assert.throws(
    () => assertDeploymentIsolation(config),
    /DATABASE_URL/,
  );
});

test('rejects local database in staging', () => {
  const config = staging();

  config.DATABASE_URL =
    'postgresql://freelancer_staging_runtime:' +
    'test-password@localhost:5432/' +
    'freelancer_staging';

  assert.throws(
    () => assertDeploymentIsolation(config),
    /DATABASE_URL/,
  );
});

test('requires explicit deployed environment', () => {
  const config = staging();

  delete config.DEPLOYMENT_ENV;

  assert.throws(
    () => assertDeploymentIsolation(config),
    /DEPLOYMENT_ENV/,
  );
});

test('rejects production identity in development', () => {
  assert.throws(
    () => assertDeploymentIsolation({
      NODE_ENV: 'development',
      DEPLOYMENT_ENV: 'production',
    }),
    /DEPLOYMENT_ENV/,
  );
});

test('rejects shadow database on API runtime', () => {
  const config = staging();

  config.SHADOW_DATABASE_URL =
    'postgresql://example:example@db.example.internal/' +
    'shadow';

  assert.throws(
    () => assertDeploymentIsolation(config),
    /SHADOW_DATABASE_URL/,
  );
});

test('never exposes database credentials in errors', () => {
  const config = staging();

  config.DATABASE_URL =
    'postgresql://wrong-role:private-secret-value' +
    '@db.example.internal/freelancer_staging';

  assert.throws(
    () => assertDeploymentIsolation(config),
    (error: unknown) => {
      assert.ok(error instanceof Error);

      assert.equal(
        error.message.includes(
          'private-secret-value',
        ),
        false,
      );

      return true;
    },
  );
});