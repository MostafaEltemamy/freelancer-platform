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
import type { ReactNode } from 'react';
import type { VersionedRecord } from './portfolio.types';
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


/**
 * Portfolio page integration tests verify which versioned
 * records are submitted when an item is moved.
 *
 * Actual drag-end handling is tested separately in
 * SortablePortfolioList.test.tsx.
 */
type TestSortableItem = VersionedRecord & {
  title?: string;
  name?: string;
};

vi.mock('./SortablePortfolioList', () => ({
  SortablePortfolioList: ({
    items,
    disabled,
    label,
    renderItem,
    onReorder,
  }: {
    items: readonly TestSortableItem[];
    disabled?: boolean;
    label: (item: TestSortableItem) => string;
    renderItem: (
      item: TestSortableItem,
      index: number,
    ) => ReactNode;
    onReorder: (
      items: VersionedRecord[],
    ) => Promise<boolean>;
  }) => (
    <div role="list">
      {items.map((item, index) => (
        <div key={item.id} role="listitem">
          {!disabled && index > 0 && (
            <button
              type="button"
              aria-label={`Simulate drag ${label(item)} up`}
              onClick={() => {
                const reordered = [...items];

                [
                  reordered[index - 1],
                  reordered[index],
                ] = [
                  reordered[index]!,
                  reordered[index - 1]!,
                ];

                void onReorder(
                  reordered.map((record) => ({
                    id: record.id,
                    version: record.version,
                  })),
                );
              }}
            >
              Simulate reorder
            </button>
          )}

          {renderItem(item, index)}
        </div>
      ))}
    </div>
  ),
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
  version: 1,
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
  version: 1,
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
    project.version,
  );
});

test('submits versioned project order after dragging', async () => {
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
      name: 'Simulate drag Second Project up',
    }),
  );

  expect(
    await screen.findByText('Project order updated.'),
  ).toBeInTheDocument();

  expect(portfolioApi.reorderProjects).toHaveBeenCalledWith([
    { id: second.id, version: second.version },
    { id: project.id, version: project.version },
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
    const renamed = {
    ...skill,
    name: 'C#',
    version: 2,
  };

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
    1,
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

  expect(
    screen.queryByRole('button', {
      name: /Simulate drag/,
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

  expect(
    screen.queryByRole('group', {
      name: 'Version conflict recovery',
    }),
  ).not.toBeInTheDocument();
});

test('preserves unsaved project changes after a version conflict', async () => {
  vi.mocked(portfolioApi.listProjects).mockResolvedValue({
    projects: [project],
  });

  vi.mocked(portfolioApi.updateProject).mockRejectedValue(
    new ApiError(
      'This project has changed since you opened it.',
      409,
      'STALE_VERSION',
    ),
  );

  renderPortfolio();

  await screen.findByText('Research Dashboard');

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Edit Research Dashboard',
    }),
  );

  const titleInput = screen.getByLabelText('Project title');

  fireEvent.change(titleInput, {
    target: { value: 'My unsaved project changes' },
  });

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Save project',
    }),
  );

  expect(
    await screen.findByRole('alert'),
  ).toHaveTextContent(
    'This project has changed since you opened it.',
  );

  expect(titleInput).toHaveValue(
    'My unsaved project changes',
  );

  expect(portfolioApi.updateProject).toHaveBeenCalledWith(
    project.id,
    expect.objectContaining({
      title: 'My unsaved project changes',
    }),
    1,
  );

  expect(
    screen.queryByText('Project updated successfully.'),
  ).not.toBeInTheDocument();
});

test('preserves the entered skill name after a version conflict', async () => {
  vi.mocked(portfolioApi.listSkills).mockResolvedValue({
    skills: [skill],
  });

  vi.mocked(portfolioApi.updateSkill).mockRejectedValue(
    new ApiError(
      'This skill has changed since you opened it.',
      409,
      'STALE_VERSION',
    ),
  );

  renderPortfolio();

  await screen.findByText('C++');

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Rename C++',
    }),
  );

  const input = screen.getByLabelText('Rename skill C++');

  fireEvent.change(input, {
    target: { value: 'Molecular Biology' },
  });

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Save skill',
    }),
  );

  expect(
    await screen.findByRole('alert'),
  ).toHaveTextContent(
    'This skill has changed since you opened it.',
  );

  expect(input).toHaveValue('Molecular Biology');

  expect(portfolioApi.updateSkill).toHaveBeenCalledWith(
    skill.id,
    { name: 'Molecular Biology' },
    1,
  );

  expect(
    screen.queryByText('Skill renamed successfully.'),
  ).not.toBeInTheDocument();
});


test('reorders skills with their current versions', async () => {
  const second = {
    ...skill,
    id: '44444444-4444-4444-8444-444444444444',
    name: 'React',
    sortOrder: 1,
    version: 3,
  };

  vi.mocked(portfolioApi.listSkills)
    .mockResolvedValueOnce({
      skills: [skill, second],
    })
    .mockResolvedValueOnce({
      skills: [
        { ...second, sortOrder: 0, version: 4 },
        { ...skill, sortOrder: 1, version: 2 },
      ],
    });

  vi.mocked(portfolioApi.reorderSkills).mockResolvedValue({
    skills: [
      { ...second, sortOrder: 0, version: 4 },
      { ...skill, sortOrder: 1, version: 2 },
    ],
  });

  renderPortfolio();

  await screen.findByText('React');

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Simulate drag React up',
    }),
  );

  expect(
    await screen.findByText('Skill order updated.'),
  ).toBeInTheDocument();

  expect(portfolioApi.reorderSkills).toHaveBeenCalledWith([
    { id: second.id, version: 3 },
    { id: skill.id, version: 1 },
  ]);
});

test('reloads newer data only after explicit conflict recovery', async () => {
  const latestProject: PortfolioProject = {
    ...project,
    title: 'Updated from another tab',
    version: 2,
  };

  vi.mocked(portfolioApi.listProjects)
    .mockResolvedValueOnce({
      projects: [project],
    })
    .mockResolvedValueOnce({
      projects: [latestProject],
    });

  vi.mocked(portfolioApi.updateProject).mockRejectedValue(
    new ApiError(
      'This project has changed since you opened it.',
      409,
      'STALE_VERSION',
    ),
  );

  renderPortfolio();

  await screen.findByText('Research Dashboard');

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Edit Research Dashboard',
    }),
  );

  fireEvent.change(
    screen.getByLabelText('Project title'),
    {
      target: {
        value: 'My unsaved project draft',
      },
    },
  );

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Save project',
    }),
  );

  expect(
    await screen.findByRole('group', {
      name: 'Version conflict recovery',
    }),
  ).toBeInTheDocument();

  // We must not refresh automatically after a conflict.
  expect(portfolioApi.listProjects).toHaveBeenCalledTimes(1);

  expect(
    screen.getByLabelText('Project title'),
  ).toHaveValue('My unsaved project draft');

  expect(
    screen.queryByText('Updated from another tab'),
  ).not.toBeInTheDocument();

  // The user explicitly decides to discard the old draft.
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Discard local edits and load latest',
    }),
  );

  expect(
    await screen.findByText('Updated from another tab'),
  ).toBeInTheDocument();

  expect(portfolioApi.listProjects).toHaveBeenCalledTimes(2);

  expect(
    screen.queryByRole('group', {
      name: 'Version conflict recovery',
    }),
  ).not.toBeInTheDocument();

  expect(
    screen.queryByLabelText('Project title'),
  ).not.toBeInTheDocument();
});

test('keeps the unsaved project draft if conflict refresh fails', async () => {
  vi.mocked(portfolioApi.listProjects)
    .mockResolvedValueOnce({
      projects: [project],
    })
    .mockRejectedValueOnce(
      new ApiError(
        'Unable to load the latest portfolio.',
        503,
      ),
    );

  vi.mocked(portfolioApi.updateProject).mockRejectedValue(
    new ApiError(
      'This project has changed since you opened it.',
      409,
      'STALE_VERSION',
    ),
  );

  renderPortfolio();

  await screen.findByText('Research Dashboard');

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Edit Research Dashboard',
    }),
  );

  fireEvent.change(
    screen.getByLabelText('Project title'),
    {
      target: {
        value: 'Important unsaved research project',
      },
    },
  );

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Save project',
    }),
  );

  await screen.findByRole('group', {
    name: 'Version conflict recovery',
  });

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Discard local edits and load latest',
    }),
  );

  expect(
    await screen.findByRole('alert'),
  ).toHaveTextContent(
    'Unable to load the latest portfolio.',
  );

  // A failed refresh must not destroy the existing editor.
  expect(
    screen.getByLabelText('Project title'),
  ).toHaveValue('Important unsaved research project');

  expect(
    screen.getByRole('group', {
      name: 'Version conflict recovery',
    }),
  ).toBeInTheDocument();
});
