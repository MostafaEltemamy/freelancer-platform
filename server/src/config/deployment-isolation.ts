type Environment = Readonly<
  Record<string, string | undefined>
>;

type DeploymentTarget = 'staging' | 'production';

interface DeploymentIdentity {
  database: string;
  role: string;
  bucket: string;
}

const IDENTITIES: Record<
  DeploymentTarget,
  DeploymentIdentity
> = {
  staging: {
    database: 'freelancer_staging',
    role: 'freelancer_staging_runtime',
    bucket: 'freelancer-media-staging',
  },

  production: {
    database: 'freelancer_prod',
    role: 'freelancer_prod_runtime',
    bucket: 'freelancer-media-prod',
  },
};

/**
 * Prevent deployed application instances from using
 * the wrong PostgreSQL database, runtime role or
 * Cloudflare R2 bucket.
 *
 * This validates configuration only.
 * It never connects to PostgreSQL or R2.
 *
 * Secrets and connection strings are never logged.
 */
export function assertDeploymentIsolation(
  env: Environment = process.env,
): void {
  const nodeEnv = env.NODE_ENV?.trim();
  const deployment = env.DEPLOYMENT_ENV?.trim();

  // Local development must never masquerade as a
  // staging or production deployment.
  if (nodeEnv !== 'production') {
    if (
      deployment &&
      deployment !== 'development'
    ) {
      throw new Error(
        'Deployment isolation rejected: ' +
        'NODE_ENV, DEPLOYMENT_ENV',
      );
    }

    return;
  }

  if (
    deployment !== 'staging' &&
    deployment !== 'production'
  ) {
    throw new Error(
      'Deployment isolation rejected: DEPLOYMENT_ENV',
    );
  }

  const target = IDENTITIES[deployment];

  const invalid = new Set<string>();

  // -----------------------------------------------
  // Verify the R2 bucket identity.
  // -----------------------------------------------

  if (env.S3_BUCKET?.trim() !== target.bucket) {
    invalid.add('S3_BUCKET');
  }

  // -----------------------------------------------
  // Verify the PostgreSQL connection identity.
  // -----------------------------------------------

  const databaseUrl = env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    invalid.add('DATABASE_URL');
  } else {
    try {
      const url = new URL(databaseUrl);

      const database = decodeURIComponent(
        url.pathname.replace(/^\//, ''),
      );

      const username = decodeURIComponent(
        url.username,
      );

      const host = url.hostname.toLowerCase();

      if (
        !['postgres:', 'postgresql:'].includes(
          url.protocol,
        ) ||
        !host ||
        [
          'localhost',
          '127.0.0.1',
          '[::1]',
          '0.0.0.0',
        ].includes(host) ||
        !url.password ||
        database !== target.database ||
        username !== target.role
      ) {
        invalid.add('DATABASE_URL');
      }
    } catch {
      invalid.add('DATABASE_URL');
    }
  }

  // A running API must not be supplied the
  // development shadow-database connection.
  if (env.SHADOW_DATABASE_URL?.trim()) {
    invalid.add('SHADOW_DATABASE_URL');
  }

  if (invalid.size > 0) {
    throw new Error(
      'Deployment isolation rejected: ' +
      [...invalid].sort().join(', '),
    );
  }
}