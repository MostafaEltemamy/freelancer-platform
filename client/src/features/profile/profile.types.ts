export interface PublicProjectImage {
  url: string;
  altText: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
}

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
  coverImage?: PublicProjectImage | null; // Optional for compatibility with earlier API responses.
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

export type PublicProjectField =
  | {
      label: string;
      type: 'SHORT_TEXT' | 'LONG_TEXT' | 'URL' | 'DATE';
      value: string | null;
    }
  | {
      label: string;
      type: 'NUMBER';
      value: number | null;
    }
  | {
      label: string;
      type: 'BOOLEAN';
      value: boolean | null;
    }
  | {
      label: string;
      type: 'LIST';
      value: string[];
    };

export interface PublicProjectSection {
  title: string;
  description: string | null;
  fields: PublicProjectField[];
}

export interface PublicProjectContent {
  schemaVersion: 1;
  sections: PublicProjectSection[];
}

export interface PublicProjectDetail extends PublicPortfolioProject {
  content: PublicProjectContent;
  images?: PublicProjectImage[];
}

export interface PublicProjectDetailResponse {
  project: PublicProjectDetail;
}
