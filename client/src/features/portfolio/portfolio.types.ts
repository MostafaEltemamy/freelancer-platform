export type ProjectVisibility = 'PRIVATE' | 'PUBLIC';

export interface PortfolioProject {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  role: string | null;

  projectUrl: string | null;
  sourceUrl: string | null;
  technologies: string[];

  // Serialized dates are returned as ISO date-time strings.
  startedOn: string | null;
  endedOn: string | null;

  visibility: ProjectVisibility;
  sortOrder: number;
  isFeatured: boolean;

  createdAt: string;
  updatedAt: string;

  version: number;
}

export interface VersionedRecord {
  id: string;
  version: number;
}

export interface CreateProjectInput {
  slug: string;
  title: string;

  summary?: string | null;
  description?: string | null;
  role?: string | null;

  projectUrl?: string | null;
  sourceUrl?: string | null;
  technologies?: string[];

  // Inputs must use YYYY-MM-DD, not full timestamps.
  startedOn?: string | null;
  endedOn?: string | null;

  visibility?: ProjectVisibility;
  sortOrder?: number;
  isFeatured?: boolean;
}

export interface VersionedRecord {
  id: string;
  version: number;
}

export type UpdateProjectInput = Partial<CreateProjectInput>;

export interface ProjectsResponse {
  projects: PortfolioProject[];
}

export interface ProjectResponse {
  project: PortfolioProject;
}

export interface PortfolioSkill {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SkillsResponse {
  skills: PortfolioSkill[];
}

export interface SkillResponse {
  skill: PortfolioSkill;
}

export interface SkillInput {
  name: string;
}

export interface ReorderInput {
  ids: string[];
}
