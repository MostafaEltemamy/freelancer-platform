import { Prisma } from '../../generated/prisma/client.js';

import { withLockedProfile } from './profile-lock.js';

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

// All project and skill modifications use the same
// profile-level lock as publication.
export function withEditablePortfolio<T>(
  userId: string,
  work: (
    tx: Prisma.TransactionClient,
    profileId: string,
  ) => Promise<T>,
): Promise<T> {
  return withLockedProfile(
    userId,
    async (tx, profile) => {
      if (!profile?.username) {
        throw new PortfolioSetupRequiredError();
      }

      if (profile.status !== 'DRAFT') {
        throw new PortfolioPublishedError();
      }

      const result = await work(tx, profile.id);

      // Every successful portfolio mutation invalidates
      // the previous onboarding confirmation.
      await tx.freelancerProfile.update({
        where: { id: profile.id },
        data: {
          onboardingCompletedAt: null,
          updatedAt: new Date(),
        },
      });

      return result;
    },
  );
}
