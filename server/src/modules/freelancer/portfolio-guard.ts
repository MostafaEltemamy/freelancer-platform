import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../database/prisma.js';

export class PortfolioSetupRequiredError extends Error {
  constructor() {
    super('Reserve a username before managing your portfolio.');
    this.name = 'PortfolioSetupRequiredError';
  }
}

export class PortfolioPublishedError extends Error {
  constructor() {
    super(
      'Unpublish your freelancer profile before modifying your portfolio.',
    );
    this.name = 'PortfolioPublishedError';
  }
}

type LockedProfile = {
  id: string;
  username: string | null;
  status: 'DRAFT' | 'PUBLISHED';
};

// All portfolio mutations use this transaction.
// Locking the parent row synchronizes portfolio writes
// with the existing profile publication workflow.
export async function withEditablePortfolio<T>(
  userId: string,
  work: (
    tx: Prisma.TransactionClient,
    profileId: string,
  ) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<LockedProfile[]>`
        SELECT id, username, status::text AS status
        FROM freelancer_profiles
        WHERE user_id = ${userId}::uuid
        FOR UPDATE
      `;

      const profile = rows[0];

      if (!profile?.username) {
        throw new PortfolioSetupRequiredError();
      }

      if (profile.status !== 'DRAFT') {
        throw new PortfolioPublishedError();
      }

      const result = await work(tx, profile.id);

      // Make the parent profile require validation again.
      // Updating its version also invalidates a competing
      // publication operation that read an older version.
      await tx.freelancerProfile.update({
        where: { id: profile.id },
        data: {
          onboardingCompletedAt: null,
          updatedAt: new Date(),
        },
      });

      return result;
    },
    {
      maxWait: 5000,
      timeout: 15000,
    },
  );
}
