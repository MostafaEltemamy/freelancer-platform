export interface PublicFreelancerProfile {
  username: string;
  headline: string | null;
  bio: string | null;
  city: string | null;
  countryCode: string | null;
  websiteUrl: string | null;
}

export interface PublicProfileResponse {
  profile: PublicFreelancerProfile;
}
