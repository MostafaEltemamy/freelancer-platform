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

import { ApiError } from '../../lib/api-client';
import { profileApi } from './profile.api';
import { PublicProjectPage } from './PublicProjectPage';
import type {PublicProjectDetail} from './profile.types';

expect.extend(matchers);

vi.mock('./profile.api', () => ({
  profileApi: {
    getPublicProject: vi.fn(),
  },
}));

const project: PublicProjectDetail = {
  slug: 'brand-identity',
  title: 'Brand Identity Redesign',
  summary: 'A complete new visual identity.',
  description: 'Branding work for a café.',
  role: 'Graphic Designer',
  projectUrl: 'https://example.com/work',
  sourceUrl: null,
  technologies: [],
  startedOn: null,
  endedOn: null,
  isFeatured: true,
  content: {
    schemaVersion: 1,
    sections: [
      {
        title: 'Deliverables',
        description: 'Work delivered to the client.',
        fields: [
          {
            label: 'Client',
            type: 'SHORT_TEXT',
            value: 'Café Luna',
          },
          {
            label: 'Files delivered',
            type: 'LIST',
            value: [
              'Logo',
              'Packaging',
              'Brand guidelines',
            ],
          },
          {
            label: 'Project approved',
            type: 'BOOLEAN',
            value: true,
          },
        ],
      },
    ],
  },
};

function renderProject() {
  return render(
    <MemoryRouter
      initialEntries={[
        '/u/testfreelancer/projects/brand-identity',
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
}

beforeEach(() => {
  vi.resetAllMocks();
});

test('renders a project and its custom sections without login', async () => {
  vi.mocked(
    profileApi.getPublicProject,
  ).mockResolvedValue({
    project,
  });

  renderProject();

  expect(
    await screen.findByRole('heading', {
      name: 'Brand Identity Redesign',
    }),
  ).toBeInTheDocument();

  expect(
    profileApi.getPublicProject,
  ).toHaveBeenCalledWith(
    'testfreelancer',
    'brand-identity',
  );

  expect(
    screen.getByRole('heading', {
      name: 'Deliverables',
    }),
  ).toBeInTheDocument();

  expect(screen.getByText('Café Luna'))
    .toBeInTheDocument();

  expect(screen.getByText('Packaging'))
    .toBeInTheDocument();

  expect(screen.getByText('Yes'))
    .toBeInTheDocument();

  expect(
    screen.getByRole('link', {
      name: 'Open project website',
    }),
  ).toHaveAttribute(
    'href',
    'https://example.com/work',
  );

  expect(
    screen.queryByRole('button', {
      name: /sign out/i,
    }),
  ).not.toBeInTheDocument();
});

test('does not expose unavailable projects', async () => {
  vi.mocked(
    profileApi.getPublicProject,
  ).mockRejectedValue(
    new ApiError('Project not found.', 404),
  );

  renderProject();

  expect(
    await screen.findByRole('heading', {
      name: 'Project unavailable',
    }),
  ).toBeInTheDocument();

  expect(
    screen.queryByRole('heading', {
      name: 'Brand Identity Redesign',
    }),
  ).not.toBeInTheDocument();
});

test('never renders an unsafe custom field URL as a link', async () => {
  vi.mocked(
    profileApi.getPublicProject,
  ).mockResolvedValue({
    project: {
      ...project,
      projectUrl: null,
      content: {
        schemaVersion: 1,
        sections: [
          {
            title: 'External links',
            description: null,
            fields: [
              {
                label: 'Unsafe link',
                type: 'URL',
                value: 'javascript:alert(1)',
              },
            ],
          },
        ],
      },
    },
  });

  renderProject();

  await screen.findByRole('heading', {
    name: 'External links',
  });

  expect(
    screen.queryByRole('link', {
      name: 'Open link',
    }),
  ).not.toBeInTheDocument();
});
