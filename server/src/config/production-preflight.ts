/**
 * Fail closed when a production deployment is
 * missing essential security or storage settings.
 *
 * No network requests or database mutations.
 * Never includes secret values in error messages.
 */
export function assertProductionConfiguration(
  env: Readonly<Record<string, string | undefined>> =
    process.env,
): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }

  const invalid = new Set<string>();

  function required(name: string): string {
    const value = env[name]?.trim();

    if (!value) {
      invalid.add(name);
      return '';
    }

    return value;
  }

  const databaseUrl = required('DATABASE_URL');
  const csrfSecret = required('CSRF_SECRET');
  const allowedOrigins = required(
    'CSRF_ALLOWED_ORIGINS',
  );

  const bucket = required('S3_BUCKET');
  const region = required('S3_REGION');
  const endpoint = required('S3_ENDPOINT');

  const accessKeyId = required(
    'S3_ACCESS_KEY_ID',
  );

  const secretAccessKey = required(
    'S3_SECRET_ACCESS_KEY',
  );

  // ----------------------------------------------
  // PostgreSQL database
  // ----------------------------------------------

  if (databaseUrl) {
    try {
      const url = new URL(databaseUrl);

      if (
        !['postgres:', 'postgresql:'].includes(
          url.protocol,
        ) ||
        !url.hostname ||
        [
          'localhost',
          '127.0.0.1',
          '[::1]',
        ].includes(url.hostname)
      ) {
        invalid.add('DATABASE_URL');
      }
    } catch {
      invalid.add('DATABASE_URL');
    }
  }

  // ----------------------------------------------
  // CSRF signing secret
  // ----------------------------------------------

  if (csrfSecret) {
    const decoded = Buffer.from(
      csrfSecret,
      'base64url',
    );

    if (
      !/^[A-Za-z0-9_-]{43}$/.test(csrfSecret) ||
      decoded.length !== 32 ||
      decoded.toString('base64url') !== csrfSecret
    ) {
      invalid.add('CSRF_SECRET');
    }
  }

  // ----------------------------------------------
  // Trusted browser origins
  // ----------------------------------------------

  if (allowedOrigins) {
    const origins = allowedOrigins.split(',');

    for (const entry of origins) {
      const origin = entry.trim();

      try {
        const url = new URL(origin);

        if (
          url.protocol !== 'https:' ||
          origin !== url.origin ||
          !url.hostname ||
          ['localhost', '127.0.0.1'].includes(
            url.hostname,
          )
        ) {
          invalid.add('CSRF_ALLOWED_ORIGINS');
        }
      } catch {
        invalid.add('CSRF_ALLOWED_ORIGINS');
      }
    }
  }

  // ----------------------------------------------
  // Cloudflare R2
  // ----------------------------------------------

  if (bucket === 'freelancer-media-dev') {
    invalid.add('S3_BUCKET');
  }

  if (region && region !== 'auto') {
    invalid.add('S3_REGION');
  }

  if (endpoint) {
    try {
      const url = new URL(endpoint);

      if (
        url.protocol !== 'https:' ||
        !url.hostname.endsWith(
          '.r2.cloudflarestorage.com',
        ) ||
        !['', '/'].includes(url.pathname) ||
        url.search ||
        url.hash ||
        url.username ||
        url.password ||
        url.port
      ) {
        invalid.add('S3_ENDPOINT');
      }
    } catch {
      invalid.add('S3_ENDPOINT');
    }
  }

  // The production application must not reuse the
  // separate audit credential pair.
  if (
    accessKeyId &&
    accessKeyId === env.R2_AUDIT_ACCESS_KEY_ID
  ) {
    invalid.add('R2_AUDIT_ACCESS_KEY_ID');
  }

  if (
    secretAccessKey &&
    secretAccessKey ===
      env.R2_AUDIT_SECRET_ACCESS_KEY
  ) {
    invalid.add('R2_AUDIT_SECRET_ACCESS_KEY');
  }

  if (invalid.size > 0) {
    throw new Error(
      'Production startup blocked. ' +
      'Review these environment settings: ' +
      [...invalid].sort().join(', '),
    );
  }
}