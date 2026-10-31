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

const projectId = '11111111-1111-4111-8111-111111111111';
const skillId = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.resetAllMocks();
});

// =====================================================
// TEST 1 — List projects
// =====================================================

test('lists the authenticated freelancer projects', async () => {
  await portfolioApi.listProjects();

  expect(apiRequest).toHaveBeenCalledWith(
    '/api/freelancer/projects',
  );
});

// =====================================================
// TEST 2 — Create project
// =====================================================

test('creates a project using a protected POST request', async () => {
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

// =====================================================
// TEST 3 — Update project with version
// =====================================================

test('updates an existing project using PATCH and version', async () => {
  const input = {
    title: 'Updated Research Dashboard',
    visibility: 'PUBLIC' as const,
  };

  const version = 2;

  await portfolioApi.updateProject(
    projectId,
    input,
    version,
  );

  expect(protectedWrite).toHaveBeenCalledWith(
    `/api/freelancer/projects/${projectId}`,
    'PATCH',
    {
      ...input,
      version,
    },
  );
});

// =====================================================
// TEST 4 — Delete project with version
// =====================================================

test('deletes a project with its expected version', async () => {
  const version = 3;

  await portfolioApi.deleteProject(
    projectId,
    version,
  );

  expect(protectedWrite).toHaveBeenCalledWith(
    `/api/freelancer/projects/${projectId}`,
    'DELETE',
    {
      version,
    },
  );
});

// =====================================================
// TEST 5 — Reorder projects with version records
// =====================================================

test('reorders projects using PUT and versioned records', async () => {
  const items = [
    {
      id: projectId,
      version: 2,
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      version: 1,
    },
  ];

  await portfolioApi.reorderProjects(items);

  expect(protectedWrite).toHaveBeenCalledWith(
    '/api/freelancer/projects/order',
    'PUT',
    {
      items,
    },
  );
});

// =====================================================
// TEST 6 — List skills
// =====================================================

test('lists the authenticated freelancer skills', async () => {
  await portfolioApi.listSkills();

  expect(apiRequest).toHaveBeenCalledWith(
    '/api/freelancer/skills',
  );
});

// =====================================================
// TEST 7 — Create, rename and delete skills
// =====================================================

test('creates, renames and deletes a skill', async () => {
  await portfolioApi.createSkill({
    name: 'C++',
  });

  expect(protectedWrite).toHaveBeenCalledWith(
    '/api/freelancer/skills',
    'POST',
    {
      name: 'C++',
    },
  );

  await portfolioApi.updateSkill(skillId, {
    name: 'C#',
  });

  expect(protectedWrite).toHaveBeenCalledWith(
    `/api/freelancer/skills/${skillId}`,
    'PATCH',
    {
      name: 'C#',
    },
  );

  await portfolioApi.deleteSkill(skillId);

  expect(protectedWrite).toHaveBeenCalledWith(
    `/api/freelancer/skills/${skillId}`,
    'DELETE',
  );
});

// =====================================================
// TEST 8 — Reorder skills
// =====================================================

test('reorders skills with the complete ID list', async () => {
  const ids = [
    skillId,
    '44444444-4444-4444-8444-444444444444',
  ];

  await portfolioApi.reorderSkills(ids);

  expect(protectedWrite).toHaveBeenCalledWith(
    '/api/freelancer/skills/order',
    'PUT',
    {
      ids,
    },
  );
});
