const DEVELOPMENT_ORIGINS = [
  'http://localhost:5001',
  'http://127.0.0.1:5001',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
];

function loadTrustedOrigins(): ReadonlySet<string> {
  const production = process.env.NODE_ENV === 'production';

  const configured = process.env.CSRF_ALLOWED_ORIGINS?.trim();

  if (production && !configured) {
    throw new Error(
      'CSRF_ALLOWED_ORIGINS is required in production.',
    );
  }

  const origins = configured
    ? configured.split(',').map((value) => value.trim())
    : DEVELOPMENT_ORIGINS;

  const trusted = new Set<string>();

  for (const origin of origins) {
    const url = new URL(origin);

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      origin !== url.origin ||
      (production && url.protocol !== 'https:')
    ) {
      throw new Error(
        `Invalid trusted origin: ${origin}`,
      );
    }

    trusted.add(origin);
  }

  return trusted;
}

export const TRUSTED_ORIGINS = loadTrustedOrigins();
