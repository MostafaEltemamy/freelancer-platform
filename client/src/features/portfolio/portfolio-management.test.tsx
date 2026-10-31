import { beforeEach, expect, test, vi } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { ApiError } from '../../lib/api-client';
import { profileApi } from '../profile/profile.api';
import { portfolioApi } from './portfolio.api';

import { PortfolioManagementPage } from './PortfolioManagementPage';

import type { FreelancerProfile } from '../onboarding/onboarding.types';
import type {
  PortfolioProject,
  PortfolioSkill,
} from './portfolio.types';

expect.extend(matchers);

vi.mock('../profile/profile.api', () => ({
  profileApi: {
    getMine: vi.fn(),
  },
}));

vi.mock('./portfolio.api', () => ({
  portfolioApi: {
    listProjects: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    reorderProjects: vi.fn(),
    listSkills: vi.fn(),
    createSkill: vi.fn(),
    updateSkill: vi.fn(),
    deleteSkill: vi.fn(),
    reorderSkills: vi.fn(),
  },
}));

const draftProfile: FreelancerProfile = {
  id: 'test-profile',
  username: 'testfreelancer',
  headline: 'Professional Software Developer',
  bio: 'I build software applications for businesses worldwide.',
  city: 'Dubai',
  countryCode: 'AE',
  websiteUrl: null,
  status: 'DRAFT',
  onboardingCompletedAt: null,
  publishedAt: null,
  updatedAt: '2026-10-31T10:00:00.000Z',
};

const project: PortfolioProject = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'research-dashboard',
  title: 'Research Dashboard',
  summary: 'A scientific data dashboard',
  description: null,
  role: null,
  projectUrl: null,
  sourceUrl: null,
  technologies: ['React'],
  startedOn: null,
  endedOn: null,
  visibility: 'PRIVATE',
  sortOrder: 0,
  isFeatured: false,
  createdAt: '2026-10-31T10:00:00.000Z',
  updatedAt: '2026-10-31T10:00:00.000Z',
};

const skill: PortfolioSkill = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'C++',
  sortOrder: 0,
  createdAt: '2026-10-31T10:00:00.000Z',
  updatedAt: '2026-10-31T10:00:00.000Z',
};

function renderPortfolio() {
  return render(
    <MemoryRouter>
      <PortfolioManagementPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(profileApi.getMine).mockResolvedValue({
    profile: draftProfile,
  });

  vi.mocked(portfolioApi.listProjects).mockResolvedValue({
    projects: [],
  });

  vi.mocked(portfolioApi.listSkills).mockResolvedValue({
    skills: [],
  });
});

test('directs accounts without a profile to onboarding', async () => {
  vi.mocked(profileApi.getMine).mockResolvedValue({
    profile: null,
  });

  renderPortfolio();

  expect(
    await screen.findByRole('heading', {
      name: 'Set up your freelancer profile',
    }),
  ).toBeInTheDocument();

  expect(
    screen.getByRole('link', {
      name: 'Start onboarding',
    }),
  ).toHaveAttribute('href', '/onboarding');
});

test('creates a portfolio project', async () => {
  vi.mocked(portfolioApi.listProjects)
    .mockResolvedValueOnce({ projects: [] })
    .mockResolvedValueOnce({ projects: [project] });

  vi.mocked(portfolioApi.createProject).mockResolvedValue({
    project,
  });

  renderPortfolio();

  await screen.findByRole('heading', {
    name: 'Manage your portfolio',
  });

  fireEvent.click(
    screen.getByRole('button', { name: 'Add project' }),
  );

  fireEvent.change(screen.getByLabelText('Project title'), {
    target: { value: 'Research Dashboard' },
  });

  fireEvent.change(screen.getByLabelText('Project slug'), {
    target: { value: 'Research-Dashboard' },
  });

  fireEvent.change(screen.getByLabelText('Technologies'), {
    target: { value: 'React, TypeScript' },
  });

  fireEvent.click(
    screen.getByRole('button', { name: 'Create project' }),
  );

  expect(
    await screen.findByText('Project created successfully.'),
  ).toBeInTheDocument();

  expect(portfolioApi.createProject).toHaveBeenCalledWith(
    expect.objectContaining({
      slug: 'research-dashboard',
      title: 'Research Dashboard',
      technologies: ['React', 'TypeScript'],
      visibility: 'PRIVATE',
    }),
  );
});

test('requires confirmation before deleting projects', async () => {
  vi.mocked(portfolioApi.listProjects)
    .mockResolvedValueOnce({ projects: [project] })
    .mockResolvedValueOnce({ projects: [] });

  vi.mocked(portfolioApi.deleteProject).mockResolvedValue();

  renderPortfolio();

  await screen.findByText('Research Dashboard');

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Delete Research Dashboard',
    }),
  );

  expect(portfolioApi.deleteProject).not.toHaveBeenCalled();

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Confirm delete Research Dashboard',
    }),
  );

  expect(
    await screen.findByText('Project deleted successfully.'),
  ).toBeInTheDocument();

  expect(portfolioApi.deleteProject).toHaveBeenCalledWith(
    project.id,
  );
});

test('reorders projects using their IDs', async () => {
  const second = {
    ...project,
    id: '33333333-3333-4333-8333-333333333333',
    slug: 'second-project',
    title: 'Second Project',
    sortOrder: 1,
  };

  vi.mocked(portfolioApi.listProjects)
    .mockResolvedValueOnce({ projects: [project, second] })
    .mockResolvedValueOnce({ projects: [second, project] });

  vi.mocked(portfolioApi.reorderProjects).mockResolvedValue({
    projects: [second, project],
  });

  renderPortfolio();

  await screen.findByText('Second Project');

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Move Second Project up',
    }),
  );

  expect(
    await screen.findByText('Project order updated.'),
  ).toBeInTheDocument();

  expect(portfolioApi.reorderProjects).toHaveBeenCalledWith([
    second.id,
    project.id,
  ]);
});

test('adds a professional skill', async () => {
  vi.mocked(portfolioApi.listSkills)
    .mockResolvedValueOnce({ skills: [] })
    .mockResolvedValueOnce({ skills: [skill] });

  vi.mocked(portfolioApi.createSkill).mockResolvedValue({
    skill,
  });

  renderPortfolio();

  await screen.findByRole('heading', {
    name: 'Professional skills',
  });

  fireEvent.change(screen.getByLabelText('Skill name'), {
    target: { value: 'C++' },
  });

  fireEvent.click(
    screen.getByRole('button', { name: 'Add skill' }),
  );

  expect(
    await screen.findByText('Skill added successfully.'),
  ).toBeInTheDocument();

  expect(portfolioApi.createSkill).toHaveBeenCalledWith({
    name: 'C++',
  });
});

test('renames a professional skill', async () => {
  const renamed = { ...skill, name: 'C#' };

  vi.mocked(portfolioApi.listSkills)
    .mockResolvedValueOnce({ skills: [skill] })
    .mockResolvedValueOnce({ skills: [renamed] });

  vi.mocked(portfolioApi.updateSkill).mockResolvedValue({
    skill: renamed,
  });

  renderPortfolio();

  await screen.findByText('C++');

  fireEvent.click(
    screen.getByRole('button', { name: 'Rename C++' }),
  );

  fireEvent.change(
    screen.getByLabelText('Rename skill C++'),
    { target: { value: 'C#' } },
  );

  fireEvent.click(
    screen.getByRole('button', { name: 'Save skill' }),
  );

  expect(
    await screen.findByText('Skill renamed successfully.'),
  ).toBeInTheDocument();

  expect(portfolioApi.updateSkill).toHaveBeenCalledWith(
    skill.id,
    { name: 'C#' },
  );
});

test('published portfolios are read-only', async () => {
  vi.mocked(profileApi.getMine).mockResolvedValue({
    profile: {
      ...draftProfile,
      status: 'PUBLISHED',
      publishedAt: '2026-10-31T11:00:00.000Z',
    },
  });

  vi.mocked(portfolioApi.listProjects).mockResolvedValue({
    projects: [project],
  });

  vi.mocked(portfolioApi.listSkills).mockResolvedValue({
    skills: [skill],
  });

  renderPortfolio();

  expect(
    await screen.findByText('Published profile — read-only'),
  ).toBeInTheDocument();

  expect(
    screen.queryByRole('button', { name: 'Add project' }),
  ).not.toBeInTheDocument();

  expect(
    screen.queryByRole('button', { name: 'Add skill' }),
  ).not.toBeInTheDocument();

  expect(
    screen.queryByRole('button', {
      name: 'Delete Research Dashboard',
    }),
  ).not.toBeInTheDocument();
});

test('shows API errors without claiming success', async () => {
  vi.mocked(portfolioApi.createSkill).mockRejectedValue(
    new ApiError('This skill already exists in your profile.', 409),
  );

  renderPortfolio();

  await screen.findByRole('heading', {
    name: 'Professional skills',
  });

  fireEvent.change(screen.getByLabelText('Skill name'), {
    target: { value: 'React' },
  });

  fireEvent.click(
    screen.getByRole('button', { name: 'Add skill' }),
  );

  expect(
    await screen.findByRole('alert'),
  ).toHaveTextContent(
    'This skill already exists in your profile.',
  );

  expect(
    screen.queryByText('Skill added successfully.'),
  ).not.toBeInTheDocument();
});
