import { prisma } from '../../database/prisma.js';
import { verifyPassword } from './password.js';
import {enqueueMediaObjectCleanup} from '../freelancer/storage-deletion.queue.js';

export class InvalidDeletionCredentialsError
  extends Error {
  constructor() {
    super(
      'Unable to verify your account credentials.',
    );
    this.name = 'InvalidDeletionCredentialsError';
  }
}

export class AccountDeletionSessionError
  extends Error {
  constructor() {
    super(
      'Your session is no longer valid. Sign in again.',
    );
    this.name = 'AccountDeletionSessionError';
  }
}

/**
 * Permanently delete one authenticated account.
 *
 * Requirements enforced by the API:
 * - Valid authenticated session
 * - Valid CSRF token
 * - Current account password
 * - Explicit DELETE MY ACCOUNT confirmation
 *
 * The session hash is derived on the server.
 * The caller cannot provide an arbitrary user ID.
 *
 * All database changes are committed atomically:
 * 1. Queue existing original and preview objects.
 * 2. Delete the user and cascade related records.
 *
 * Storage objects are deleted later by the existing
 * durable R2 deletion worker.
 */
export async function deleteMyAccount(
  userId: string,
  password: string,
  currentSessionHash: string,
): Promise<void> {
  // Verify the password BEFORE opening a transaction.
  // Argon2 is intentionally computationally expensive;
  // never run it while holding PostgreSQL row locks.
  const credential =
    await prisma.passwordCredential.findUnique({
      where: { userId },
      select: {
        passwordHash: true,
      },
    });

  if (
    !credential ||
    !(await verifyPassword(
      credential.passwordHash,
      password,
    ))
  ) {
    throw new InvalidDeletionCredentialsError();
  }

  await prisma.$transaction(
    async (tx) => {
      // Lock the user first, then the freelancer profile.
      // This prevents a conflicting account-level cascade
      // and serializes against profile-based portfolio writes.
      const users = await tx.$queryRaw<
        Array<{ id: string }>
      >`
        SELECT id
        FROM users
        WHERE id = ${userId}::uuid
        FOR UPDATE
      `;

      if (users.length !== 1) {
        throw new AccountDeletionSessionError();
      }

      const profiles = await tx.$queryRaw<
        Array<{ id: string }>
      >`
        SELECT id
        FROM freelancer_profiles
        WHERE user_id = ${userId}::uuid
        FOR UPDATE
      `;

      // Revalidate the session AFTER obtaining the locks.
      // A session revoked while the password was being
      // verified must not authorize account deletion.
      const session = await tx.session.findFirst({
        where: {
          userId,
          tokenHash: currentSessionHash,
          revokedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
        select: { id: true },
      });

      if (!session) {
        throw new AccountDeletionSessionError();
      }

      // Also reject an account whose password hash
      // changed after the initial password verification.
      const latestCredential =
        await tx.passwordCredential.findUnique({
          where: { userId },
          select: {
            passwordHash: true,
          },
        });

      if (
        !latestCredential ||
        latestCredential.passwordHash !==
          credential.passwordHash
      ) {
        throw new InvalidDeletionCredentialsError();
      }

      const profile = profiles[0];

      // Some registered users have not yet created a
      // freelancer profile. Their account can still be
      // deleted without attempting a media query.
      if (profile) {
        const media =
          await tx.projectMedia.findMany({
            where: {
              project: {
                profileId: profile.id,
              },
            },

            select: {
              storageKey: true,
              previewKey: true,
              createdAt: true,
            },
          });

        // This operation MUST execute before the
        // cascaded deletion of projects and media.
        //
        // Jobs are stored independently of the user.
        // They survive even after the account disappears.
        await enqueueMediaObjectCleanup(
          tx,
          media,
        );
      }

      // PostgreSQL cascades:
      // - password credentials
      // - all sessions
      // - freelancer profile
      // - portfolio projects
      // - profile skills
      // - project media
      //
      // Cleanup jobs remain because they have no
      // foreign key to the account.
      const deleted = await tx.user.deleteMany({
        where: { id: userId },
      });

      if (deleted.count !== 1) {
        throw new AccountDeletionSessionError();
      }
    },
    {
      maxWait: 5000,
      timeout: 30000,
    },
  );
}