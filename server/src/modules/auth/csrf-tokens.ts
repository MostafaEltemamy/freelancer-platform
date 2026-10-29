
import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

function loadCsrfSecret(): Buffer {
  const configured = process.env.CSRF_SECRET;

  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CSRF_SECRET is required in production.',
      );
    }

    // Development-only secret, regenerated on server restart.
    return randomBytes(32);
  }

  if (!/^[A-Za-z0-9_-]{43}$/.test(configured)) {
    throw new Error('Invalid CSRF_SECRET format.');
  }

  const decoded = Buffer.from(configured, 'base64url');

  if (
    decoded.length !== 32 ||
    decoded.toString('base64url') !== configured
  ) {
    throw new Error('CSRF_SECRET must contain 32 random bytes.');
  }

  return decoded;
}

const csrfSecret = loadCsrfSecret();

export function createCsrfToken(
  sessionToken: string,
): string {
  return createHmac('sha256', csrfSecret)
    .update('freelancer-platform:csrf:v1:')
    .update(sessionToken)
    .digest('hex');
}

export function verifyCsrfToken(
  sessionToken: string,
  submittedToken: unknown,
): boolean {
  if (
    typeof submittedToken !== 'string' ||
    !/^[a-f0-9]{64}$/.test(submittedToken)
  ) {
    return false;
  }

  const expected = Buffer.from(
    createCsrfToken(sessionToken),
    'hex',
  );

  const received = Buffer.from(submittedToken, 'hex');

  return timingSafeEqual(expected, received);
}
