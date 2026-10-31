import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../database/prisma.js';

export interface LockedFreelancerProfile {
  id: string;
  username: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  headline: string | null;
  bio: string | null;
  countryCode: string | null;
  onboardingCompletedAt: Date | null;
  publishedAt: Date | null;
}

// Use one lock for publication and portfolio mutations.
export function withLockedProfile<T>(
  userId: string,
  work: (
    tx: Prisma.TransactionClient,
    profile: LockedFreelancerProfile | null,
  ) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<LockedFreelancerProfile[]>`
        SELECT
          id,
          username,
          status::text AS status,
          headline,
          bio,
          country_code AS "countryCode",
          onboarding_completed_at AS "onboardingCompletedAt",
          published_at AS "publishedAt"
        FROM freelancer_profiles
        WHERE user_id = ${userId}::uuid
        FOR UPDATE
      `;

      return work(tx, rows[0] ?? null);
    },
    {
      maxWait: 5000,
      timeout: 15000,
    },
  );
}
