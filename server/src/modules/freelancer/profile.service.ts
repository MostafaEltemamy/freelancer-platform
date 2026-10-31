import { prisma } from '../../database/prisma.js';
import type { SaveProfileInput } from './profile.schemas.js';
import { getMissingProfileFields } from './profile.requirements.js';

const PROFILE_SELECT = {
  id: true,
  username: true,
  headline: true,
  bio: true,
  city: true,
  countryCode: true,
  websiteUrl: true,
  status: true,
  onboardingCompletedAt: true,
  publishedAt: true,
  updatedAt: true,
} as const;

export class ProfileNotReadyError extends Error {
  constructor() {
    super('Reserve a username before editing your profile.');
    this.name = 'ProfileNotReadyError';
  }
}

export class ProfileNotEditableError extends Error {
  constructor() {
    super('This profile cannot be edited in its current state.');
    this.name = 'ProfileNotEditableError';
  }
}

export class IncompleteOnboardingError extends Error {
  constructor(public readonly missingFields: string[]) {
    super('Complete the required profile information.');
    this.name = 'IncompleteOnboardingError';
  }
}

export class ProfileConflictError extends Error {
  constructor() {
    super('Your profile changed. Refresh and try again.');
    this.name = 'ProfileConflictError';
  }
}

// Get only the authenticated account owner's profile.
export function getMyProfile(userId: string) {
  return prisma.freelancerProfile.findUnique({
    where: { userId },
    select: PROFILE_SELECT,
  });
}

// Save only explicitly permitted professional fields.
export async function saveMyProfile(
  userId: string,
  input: SaveProfileInput,
) {
  const updated = await prisma.freelancerProfile.updateMany({
    where: {
      userId,
      status: 'DRAFT',
      username: { not: null },
    },
    data: {
      ...input,

      // Significant changes require onboarding confirmation
      // again before the future publication workflow.
      onboardingCompletedAt: null,
    },
  });

  if (updated.count !== 1) {
    throw new ProfileNotEditableError();
  }

  return getMyProfile(userId);
}

// Complete onboarding without publishing the profile.
export async function completeMyOnboarding(userId: string) {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      username: true,
      headline: true,
      bio: true,
      countryCode: true,
      status: true,
      onboardingCompletedAt: true,
      updatedAt: true,
    },
  });

  if (!profile?.username) {
    throw new ProfileNotReadyError();
  }

  if (profile.status !== 'DRAFT') {
    throw new ProfileNotEditableError();
  }

  // Repeated completion requests are idempotent.
  if (profile.onboardingCompletedAt) {
    return getMyProfile(userId);
  }

  const missingFields = getMissingProfileFields(profile);

  if (missingFields.length > 0) {
    throw new IncompleteOnboardingError(missingFields);
  }

  // Condition the write on the version we inspected.
  // This avoids completing onboarding against an older
  // profile version if another update has intervened.
  const updated = await prisma.freelancerProfile.updateMany({
    where: {
      id: profile.id,
      userId,
      status: 'DRAFT',
      updatedAt: profile.updatedAt,
    },
    data: {
      onboardingCompletedAt: new Date(),
    },
  });

  if (updated.count !== 1) {
    throw new ProfileConflictError();
  }

  return getMyProfile(userId);
}
