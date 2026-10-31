export interface PublicPortfolioProject {
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  role: string | null;
  projectUrl: string | null;
  sourceUrl: string | null;
  technologies: string[];
  startedOn: string | null;
  endedOn: string | null;
  isFeatured: boolean;
}

export interface PublicPortfolioSkill {
  name: string;
}

export interface PublicFreelancerProfile {
  username: string;
  headline: string | null;
  bio: string | null;
  city: string | null;
  countryCode: string | null;
  websiteUrl: string | null;

  projects: PublicPortfolioProject[];
  skills: PublicPortfolioSkill[];
}

export interface PublicProfileResponse {
  profile: PublicFreelancerProfile;
}
