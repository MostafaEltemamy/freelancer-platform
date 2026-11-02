export type ProjectVisibility = 'PRIVATE' | 'PUBLIC';

export interface VersionedRecord {
  id: string;
  version: number;
}

export type ProjectFieldType =
  | 'SHORT_TEXT'
  | 'LONG_TEXT'
  | 'URL'
  | 'NUMBER'
  | 'DATE'
  | 'BOOLEAN'
  | 'LIST';

interface ProjectFieldBase {
  id: string;
  label: string;
}

export type ProjectContentField =
  | (ProjectFieldBase & {
      type: 'SHORT_TEXT' | 'LONG_TEXT' | 'URL' | 'DATE';
      value: string | null;
    })
  | (ProjectFieldBase & {
      type: 'NUMBER';
      value: number | null;
    })
  | (ProjectFieldBase & {
      type: 'BOOLEAN';
      value: boolean | null;
    })
  | (ProjectFieldBase & {
      type: 'LIST';
      value: string[];
    });

export interface ProjectContentSection {
  id: string;
  title: string;
  description: string | null;
  fields: ProjectContentField[];
}

export interface ProjectContent {
  schemaVersion: 1;
  sections: ProjectContentSection[];
}

export interface PortfolioProjectDetail extends PortfolioProject {
  content: ProjectContent;
}

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

  startedOn: string | null;
  endedOn: string | null;

  visibility: ProjectVisibility;
  sortOrder: number;
  isFeatured: boolean;
  version: number;

  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  slug: string;
  title: string;
  content?: ProjectContent;
  summary?: string | null;
  description?: string | null;
  role?: string | null;

  projectUrl?: string | null;
  sourceUrl?: string | null;
  technologies?: string[];

  startedOn?: string | null;
  endedOn?: string | null;

  visibility?: ProjectVisibility;
  sortOrder?: number;
  isFeatured?: boolean;
}

export type UpdateProjectInput = Partial<CreateProjectInput>;

export interface ProjectsResponse {
  projects: PortfolioProject[];
}

export interface ProjectResponse {
  project: PortfolioProject;
}

export interface ProjectDetailResponse {
  project: PortfolioProjectDetail;
}

export interface PortfolioSkill {
  id: string;
  name: string;
  sortOrder: number;
  version: number;
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
