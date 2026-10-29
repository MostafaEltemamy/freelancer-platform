
import { prisma } from '../../database/prisma.js';
import { hashSessionToken } from './session-tokens.js';

/**
 * Revoke exactly one session using its raw token.
 *
 * The raw token is never stored in PostgreSQL.
 * Deleting an already-revoked session is safe.
 */
export async function revokeSessionToken(
  token: string,
): Promise<void> {
  const tokenHash = hashSessionToken(token);

  await prisma.session.deleteMany({
    where: {
      tokenHash,
    },
  });
}
