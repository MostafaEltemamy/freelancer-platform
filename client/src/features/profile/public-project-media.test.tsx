import {
  beforeEach,
  expect,
  test,
  vi,
} from 'vitest';

import * as matchers from '@testing-library/jest-dom/matchers';

import {
  render,
  screen,
} from '@testing-library/react';

import {
  MemoryRouter,
  Route,
  Routes,
} from 'react-router-dom';

import { PublicPortfolioSections } from './PublicPortfolioSections';
import { PublicProjectPage } from './PublicProjectPage';
import { profileApi } from './profile.api';

import type {
  PublicPortfolioProject,
  PublicProjectDetail,
} from './profile.types';

expect.extend(matchers);

vi.mock('./profile.api', () => ({
  profileApi: {
    getPublicProject: vi.fn(),
  },
}));

const project: PublicPortfolioProject = {
  slug: 'branding-work',
  title: 'Brand Identity',
  summary: 'A visual identity project.',
  description: 'Full branding work.',
  role: 'Brand designer',
  projectUrl: null,
  sourceUrl: null,
  technologies: ['Branding'],
  startedOn: null,
  endedOn: null,
  isFeatured: false,

  coverImage: {
    url: 'https://example.test/cover.webp',
    altText: 'Brand identity cover',
    caption: 'Cover design',
    width: 1200,
    height: 800,
  },
};

beforeEach(() => {
  vi.resetAllMocks();
});

test('shows a cover image on a public project card', () => {
  render(
    <MemoryRouter>
      <PublicPortfolioSections
        username="designer"
        projects={[project]}
        skills={[]}
      />
    </MemoryRouter>,
  );

  const image = screen.getByRole('img', {
    name: 'Brand identity cover',
  });

  expect(image).toHaveAttribute(
    'src',
    'https://example.test/cover.webp',
  );

  expect(
    screen.getByRole('link', {
      name: 'View Brand Identity case study',
    }),
  ).toHaveAttribute(
    'href',
    '/u/designer/projects/branding-work',
  );
});

test('supports projects without cover images', () => {
  render(
    <MemoryRouter>
      <PublicPortfolioSections
        username="designer"
        projects={[{
          ...project,
          coverImage: null,
        }]}
        skills={[]}
      />
    </MemoryRouter>,
  );

  expect(
    screen.queryByRole('img'),
  ).not.toBeInTheDocument();

  expect(
    screen.getByRole('heading', {
      name: 'Brand Identity',
    }),
  ).toBeInTheDocument();
});

test('renders the full public project gallery', async () => {
  const detail: PublicProjectDetail = {
    ...project,
    content: {
      schemaVersion: 1,
      sections: [],
    },
    images: [
      {
        url: 'https://example.test/cover.webp',
        altText: 'Brand identity cover',
        caption: 'Main design',
        width: 1200,
        height: 800,
      },
      {
        url: 'https://example.test/second.webp',
        altText: 'Packaging design',
        caption: 'Final packaging',
        width: 1200,
        height: 800,
      },
    ],
  };

  vi.mocked(profileApi.getPublicProject)
    .mockResolvedValue({
      project: detail,
    });

  render(
    <MemoryRouter
      initialEntries={[
        '/u/designer/projects/branding-work',
      ]}
    >
      <Routes>
        <Route
          path="/u/:username/projects/:slug"
          element={<PublicProjectPage />}
        />
      </Routes>
    </MemoryRouter>,
  );

  expect(
    await screen.findByRole('heading', {
      name: 'Project gallery',
    }),
  ).toBeInTheDocument();

  expect(
    screen.getByRole('img', {
      name: 'Brand identity cover',
    }),
  ).toBeInTheDocument();

  expect(
    screen.getByRole('img', {
      name: 'Packaging design',
    }),
  ).toBeInTheDocument();

  expect(
    screen.getByText('Final packaging'),
  ).toBeInTheDocument();

  expect(
    profileApi.getPublicProject,
  ).toHaveBeenCalledWith(
    'designer',
    'branding-work',
  );
});
