import { apiRequest } from '../../lib/api-client';
import { protectedWrite } from '../../lib/protected-write';

import type {
  CreateProjectInput,
  UpdateProjectInput,
  ProjectsResponse,
  ProjectResponse,
  SkillsResponse,
  SkillResponse,
  SkillInput,
  VersionedRecord,
} from './portfolio.types';

const PROJECTS_PATH = '/api/freelancer/projects';
const SKILLS_PATH = '/api/freelancer/skills';

function itemPath(base: string, id: string): string {
  return `${base}/${encodeURIComponent(id)}`;
}

export const portfolioApi = {
  // -----------------------------------------
  // PROJECTS
  // -----------------------------------------

  listProjects(): Promise<ProjectsResponse> {
    return apiRequest<ProjectsResponse>(PROJECTS_PATH);
  },

  createProject(
    input: CreateProjectInput,
  ): Promise<ProjectResponse> {
    return protectedWrite<ProjectResponse>(
      PROJECTS_PATH,
      'POST',
      input,
    );
  },

  updateProject(
    id: string,
    input: UpdateProjectInput,
    version: number,
  ): Promise<ProjectResponse> {
    return protectedWrite<ProjectResponse>(
      itemPath(PROJECTS_PATH, id),
      'PATCH',
      { ...input, version },
    );
  },

  async deleteProject(
    id: string,
    version: number,
  ): Promise<void> {
    await protectedWrite<void>(
      itemPath(PROJECTS_PATH, id),
      'DELETE',
      { version },
    );
  },

  reorderProjects(
    items: VersionedRecord[],
  ): Promise<ProjectsResponse> {
    return protectedWrite<ProjectsResponse>(
      `${PROJECTS_PATH}/order`,
      'PUT',
      { items },
    );
  },

  // -----------------------------------------
  // SKILLS
  // -----------------------------------------

  listSkills(): Promise<SkillsResponse> {
    return apiRequest<SkillsResponse>(SKILLS_PATH);
  },

  createSkill(
    input: SkillInput,
  ): Promise<SkillResponse> {
    return protectedWrite<SkillResponse>(
      SKILLS_PATH,
      'POST',
      input,
    );
  },

  updateSkill(
    id: string,
    input: SkillInput,
    version: number,
  ): Promise<SkillResponse> {
    return protectedWrite<SkillResponse>(
      itemPath(SKILLS_PATH, id),
      'PATCH',
      { ...input, version },
    );
  },

  async deleteSkill(
    id: string,
    version: number,
  ): Promise<void> {
    await protectedWrite<void>(
      itemPath(SKILLS_PATH, id),
      'DELETE',
      { version },
    );
  },

  reorderSkills(
    items: VersionedRecord[],
  ): Promise<SkillsResponse> {
    return protectedWrite<SkillsResponse>(
      `${SKILLS_PATH}/order`,
      'PUT',
      { items },
    );
  },
};
