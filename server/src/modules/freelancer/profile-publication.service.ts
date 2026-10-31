import type { Prisma } from '../../generated/prisma/client.js';

import {
  PROFILE_SELECT,
  IncompleteOnboardingError,
  ProfileConflictError,
} from './profile.service.js';

import { getMissingProfileFields } from './profile.requirements.js';

import { withLockedProfile } from './profile-lock.js';

export class PublicationNotReadyError extends Error {
  constructor() {
    super('Reserve a username before publishing your profile.');
    this.name = 'PublicationNotReadyError';
  }
}

export class OnboardingNotCompletedError extends Error {
  constructor() {
    super('Complete onboarding before publishing your profile.');
    this.name = 'OnboardingNotCompletedError';
  }
}

// Return the authoritative profile state from inside
// the same transaction that performed the operation.
function readProfile(
  tx: Prisma.TransactionClient,
  profileId: string,
) {
  return tx.freelancerProfile.findUniqueOrThrow({
    where: { id: profileId },
    select: PROFILE_SELECT,
  });
}

// Publish only a validated draft owned by this user.
export function publishMyProfile(userId: string) {
  return withLockedProfile(userId, async (tx, profile) => {
    if (!profile?.username) {
      throw new PublicationNotReadyError();
    }

    // Idempotency: an already-published profile stays
    // published without changing the publication date.
    if (profile.status === 'PUBLISHED') {
      if (
        !profile.publishedAt ||
        !profile.onboardingCompletedAt
      ) {
        throw new ProfileConflictError();
      }

      return readProfile(tx, profile.id);
    }

    if (profile.status !== 'DRAFT') {
      throw new ProfileConflictError();
    }

    const missingFields = getMissingProfileFields(profile);

    if (missingFields.length > 0) {
      throw new IncompleteOnboardingError(missingFields);
    }

    if (!profile.onboardingCompletedAt) {
      throw new OnboardingNotCompletedError();
    }

    // The profile is locked. A competing portfolio
    // modification cannot invalidate it while we publish.
    await tx.freelancerProfile.update({
      where: { id: profile.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });

    return readProfile(tx, profile.id);
  });
}

// Unpublish and immediately make the profile private
// for subsequent public API requests.
export function unpublishMyProfile(userId: string) {
  return withLockedProfile(userId, async (tx, profile) => {
    if (!profile) {
      throw new PublicationNotReadyError();
    }

    // Idempotency: already private.
    if (
      profile.status === 'DRAFT' &&
      profile.publishedAt === null
    ) {
      return readProfile(tx, profile.id);
    }

    if (
      profile.status !== 'PUBLISHED' ||
      !profile.publishedAt
    ) {
      throw new ProfileConflictError();
    }

    await tx.freelancerProfile.update({
      where: { id: profile.id },
      data: {
        status: 'DRAFT',
        publishedAt: null,
      },
    });

    return readProfile(tx, profile.id);
  });
}
