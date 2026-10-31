import { prisma } from '../../database/prisma.js';

import {
  getMyProfile,
  IncompleteOnboardingError,
  ProfileConflictError,
} from './profile.service.js';

import {getMissingProfileFields} from './profile.requirements.js';

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

// Publish only a valid, completed draft owned by this user.
export async function publishMyProfile(userId: string) {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      username: true,
      headline: true,
      bio: true,
      countryCode: true,
      status: true,
      onboardingCompletedAt: true,
      publishedAt: true,
      updatedAt: true,
    },
  });

  if (!profile?.username) {
    throw new PublicationNotReadyError();
  }

  // Repeating a successful publication is harmless.
  if (profile.status === 'PUBLISHED') {
    if (
      profile.publishedAt &&
      profile.onboardingCompletedAt
    ) {
      return getMyProfile(userId);
    }

    throw new ProfileConflictError();
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

  // Compare the validated values with the current row.
  // A concurrent edit must not publish stale information.
  const updated = await prisma.freelancerProfile.updateMany({
    where: {
      id: profile.id,
      userId,
      status: 'DRAFT',
      username: profile.username,
      headline: profile.headline,
      bio: profile.bio,
      countryCode: profile.countryCode,
      onboardingCompletedAt: profile.onboardingCompletedAt,
      updatedAt: profile.updatedAt,
    },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });

  if (updated.count !== 1) {
    throw new ProfileConflictError();
  }

  return getMyProfile(userId);
}

// Unpublish an existing public profile.
// The profile data and completed onboarding are retained.
export async function unpublishMyProfile(userId: string) {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      status: true,
      publishedAt: true,
      updatedAt: true,
    },
  });

  if (!profile) {
    throw new PublicationNotReadyError();
  }

  // Already private: leave it unchanged.
  if (
    profile.status === 'DRAFT' &&
    profile.publishedAt === null
  ) {
    return getMyProfile(userId);
  }

  if (
    profile.status !== 'PUBLISHED' ||
    !profile.publishedAt
  ) {
    throw new ProfileConflictError();
  }

  const updated = await prisma.freelancerProfile.updateMany({
    where: {
      id: profile.id,
      userId,
      status: 'PUBLISHED',
      publishedAt: profile.publishedAt,
      updatedAt: profile.updatedAt,
    },
    data: {
      status: 'DRAFT',
      publishedAt: null,
    },
  });

  if (updated.count !== 1) {
    throw new ProfileConflictError();
  }

  return getMyProfile(userId);
}
