export interface FreelancerProfile {
  id: string;
  username: string | null;
  headline: string | null;
  bio: string | null;
  city: string | null;
  countryCode: string | null;
  websiteUrl: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  onboardingCompletedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface ProfileResponse {
  profile: FreelancerProfile | null;
}

export interface UsernameAvailabilityResponse {
  username: string;
  available: boolean;
}

export interface UsernameReservationResponse {
  username: string;
  profilePath: string;
  published: boolean;
}

export interface ProfileDraftInput {
  headline: string | null;
  bio: string | null;
  city: string | null;
  countryCode: string | null;
  websiteUrl: string | null;
}

export interface ProfileMutationResponse {
  message: string;
  profile: FreelancerProfile;
}
