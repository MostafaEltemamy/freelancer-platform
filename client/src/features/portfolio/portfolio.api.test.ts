import { beforeEach, expect, test, vi } from 'vitest';
import { apiRequest } from '../../lib/api-client';
import { protectedWrite } from '../../lib/protected-write';
import { portfolioApi } from './portfolio.api';

vi.mock('../../lib/api-client', () => ({
  apiRequest: vi.fn(),
}));

vi.mock('../../lib/protected-write', () => ({
  protectedWrite: vi.fn(),
}));

const projectId =
  '11111111-1111-4111-8111-111111111111';

const skillId =
  '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.resetAllMocks();
});

test('lists freelancer projects', async () => {
  await portfolioApi.listProjects();

  expect(apiRequest).toHaveBeenCalledWith(
    '/api/freelancer/projects',
  );
});

test('creates a project using protected POST', async () => {
  const input = {
    slug: 'research-dashboard',
    title: 'Research Dashboard',
    technologies: ['React', 'TypeScript'],
  };

  await portfolioApi.createProject(input);

  expect(protectedWrite).toHaveBeenCalledWith(
    '/api/freelancer/projects',
    'POST',
    input,
  );
});

test('updates a project with its version', async () => {
  const input = {
    title: 'Updated Research Dashboard',
    visibility: 'PUBLIC' as const,
  };

  await portfolioApi.updateProject(projectId, input, 2);

  expect(protectedWrite).toHaveBeenCalledWith(
    `/api/freelancer/projects/${projectId}`,
    'PATCH',
    { ...input, version: 2 },
  );
});

test('deletes a project with its version', async () => {
  await portfolioApi.deleteProject(projectId, 3);

  expect(protectedWrite).toHaveBeenCalledWith(
    `/api/freelancer/projects/${projectId}`,
    'DELETE',
    { version: 3 },
  );
});

test('reorders projects with versioned records', async () => {
  const items = [
    { id: projectId, version: 2 },
    {
      id: '33333333-3333-4333-8333-333333333333',
      version: 1,
    },
  ];

  await portfolioApi.reorderProjects(items);

  expect(protectedWrite).toHaveBeenCalledWith(
    '/api/freelancer/projects/order',
    'PUT',
    { items },
  );
});

test('lists freelancer skills', async () => {
  await portfolioApi.listSkills();

  expect(apiRequest).toHaveBeenCalledWith(
    '/api/freelancer/skills',
  );
});

test('creates a skill without a version', async () => {
  await portfolioApi.createSkill({ name: 'C++' });

  expect(protectedWrite).toHaveBeenCalledWith(
    '/api/freelancer/skills',
    'POST',
    { name: 'C++' },
  );
});

test('renames a skill with its expected version', async () => {
  await portfolioApi.updateSkill(
    skillId,
    { name: 'C#' },
    2,
  );

  expect(protectedWrite).toHaveBeenCalledWith(
    `/api/freelancer/skills/${skillId}`,
    'PATCH',
    {
      name: 'C#',
      version: 2,
    },
  );
});

test('deletes a skill with its expected version', async () => {
  await portfolioApi.deleteSkill(skillId, 3);

  expect(protectedWrite).toHaveBeenCalledWith(
    `/api/freelancer/skills/${skillId}`,
    'DELETE',
    { version: 3 },
  );
});

test('reorders skills using versioned records', async () => {
  const items = [
    { id: skillId, version: 3 },
    {
      id: '44444444-4444-4444-8444-444444444444',
      version: 1,
    },
  ];

  await portfolioApi.reorderSkills(items);

  expect(protectedWrite).toHaveBeenCalledWith(
    '/api/freelancer/skills/order',
    'PUT',
    { items },
  );
});
