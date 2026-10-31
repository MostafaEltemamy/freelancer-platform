import { beforeEach, expect, test, vi } from 'vitest';

import * as matchers from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom/vitest';

import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';

import {
  MemoryRouter,
  Route,
  Routes,
} from 'react-router-dom';

import { ApiError } from '../../lib/api-client';

import { ProfileManagementPage } from './ProfileManagementPage';
import { PublicProfilePage } from './PublicProfilePage';
import { profileApi } from './profile.api';

import type {
  FreelancerProfile,
} from '../onboarding/onboarding.types';

expect.extend(matchers);

vi.mock('./profile.api', () => ({
  profileApi: {
    getMine: vi.fn(),
    saveDraft: vi.fn(),
    completeOnboarding: vi.fn(),
    publish: vi.fn(),
    unpublish: vi.fn(),
    getPublic: vi.fn(),
  },
}));

const readyProfile: FreelancerProfile = {
  id: 'profile-test-id',
  username: 'testfreelancer',
  headline: 'Professional Software Developer',
  bio: 'I develop reliable applications and digital products for businesses worldwide.',
  city: 'Dubai',
  countryCode: 'AE',
  websiteUrl: 'https://example.com',
  status: 'DRAFT',
  onboardingCompletedAt: '2026-10-31T09:00:00.000Z',
  publishedAt: null,
  updatedAt: '2026-10-31T09:00:00.000Z',
};

const publishedProfile: FreelancerProfile = {
  ...readyProfile,
  status: 'PUBLISHED',
  publishedAt: '2026-10-31T10:00:00.000Z',
};

function renderManagement() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route
          path="/profile"
          element={<ProfileManagementPage />}
        />

        <Route
          path="/onboarding"
          element={<h1>Onboarding page</h1>}
        />

        <Route
          path="/u/:username"
          element={<PublicProfilePage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function renderPublic() {
  return render(
    <MemoryRouter initialEntries={['/u/testfreelancer']}>
      <Routes>
        <Route
          path="/u/:username"
          element={<PublicProfilePage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(profileApi.getMine).mockResolvedValue({
    profile: null,
  });
});

test('directs new accounts to onboarding', async () => {
  renderManagement();

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

test('requires confirmation before publication', async () => {
  vi.mocked(profileApi.getMine).mockResolvedValue({
    profile: readyProfile,
  });

  vi.mocked(profileApi.publish).mockResolvedValue({
    message: 'Profile published successfully.',
    profile: publishedProfile,
  });

  renderManagement();

  await screen.findByRole('heading', {
    name: 'Ready to publish',
  });

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Publish profile',
    }),
  );

  expect(profileApi.publish).not.toHaveBeenCalled();

  expect(
    screen.getByRole('heading', {
      name: 'Publish your profile?',
    }),
  ).toBeInTheDocument();

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Confirm publish',
    }),
  );

  expect(
    await screen.findByRole('heading', {
      name: 'Published',
    }),
  ).toBeInTheDocument();

  expect(profileApi.publish).toHaveBeenCalledTimes(1);

  expect(
    screen.getByRole('link', {
      name: 'View public profile',
    }),
  ).toHaveAttribute('href', '/u/testfreelancer');
});

test('can cancel publication', async () => {
  vi.mocked(profileApi.getMine).mockResolvedValue({
    profile: readyProfile,
  });

  renderManagement();

  await screen.findByRole('heading', {
    name: 'Ready to publish',
  });

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Publish profile',
    }),
  );

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Cancel',
    }),
  );

  expect(profileApi.publish).not.toHaveBeenCalled();

  expect(
    screen.queryByRole('heading', {
      name: 'Publish your profile?',
    }),
  ).not.toBeInTheDocument();
});

test('published information is read-only', async () => {
  vi.mocked(profileApi.getMine).mockResolvedValue({
    profile: publishedProfile,
  });

  renderManagement();

  await screen.findByRole('heading', {
    name: 'Published',
  });

  expect(
    screen.getByLabelText('Professional headline'),
  ).toBeDisabled();

  expect(
    screen.getByLabelText('Professional biography'),
  ).toBeDisabled();

  expect(
    screen.queryByRole('button', {
      name: 'Save changes',
    }),
  ).not.toBeInTheDocument();
});

test('unpublishes only after confirmation', async () => {
  vi.mocked(profileApi.getMine).mockResolvedValue({
    profile: publishedProfile,
  });

  vi.mocked(profileApi.unpublish).mockResolvedValue({
    message: 'Profile is now private.',
    profile: readyProfile,
  });

  renderManagement();

  await screen.findByRole('heading', {
    name: 'Published',
  });

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Unpublish profile',
    }),
  );

  expect(profileApi.unpublish).not.toHaveBeenCalled();

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Confirm unpublish',
    }),
  );

  expect(
    await screen.findByRole('heading', {
      name: 'Ready to publish',
    }),
  ).toBeInTheDocument();

  expect(profileApi.unpublish).toHaveBeenCalledTimes(1);

  expect(
    screen.queryByRole('link', {
      name: 'View public profile',
    }),
  ).not.toBeInTheDocument();
});

test('editing a completed draft requires revalidation', async () => {
  vi.mocked(profileApi.getMine).mockResolvedValue({
    profile: readyProfile,
  });

  const updatedProfile: FreelancerProfile = {
    ...readyProfile,
    headline: 'Updated Professional Developer',
    onboardingCompletedAt: null,
  };

  vi.mocked(profileApi.saveDraft).mockResolvedValue({
    message: 'Profile draft saved.',
    profile: updatedProfile,
  });

  vi.mocked(profileApi.completeOnboarding).mockResolvedValue({
    message: 'Onboarding completed successfully.',
    profile: {
      ...updatedProfile,
      onboardingCompletedAt: '2026-10-31T12:00:00.000Z',
    },
  });

  renderManagement();

  await screen.findByRole('heading', {
    name: 'Ready to publish',
  });

  fireEvent.change(
    screen.getByLabelText('Professional headline'),
    {
      target: { value: 'Updated Professional Developer' },
    },
  );

  expect(
    screen.getByRole('button', {
      name: 'Publish profile',
    }),
  ).toBeDisabled();

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Save changes',
    }),
  );

  expect(
    await screen.findByRole('button', {
      name: 'Complete profile',
    }),
  ).toBeInTheDocument();

  expect(profileApi.saveDraft).toHaveBeenCalledWith(
    expect.objectContaining({
      headline: 'Updated Professional Developer',
    }),
  );

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Complete profile',
    }),
  );

  expect(
    await screen.findByText(
      'Profile validated. You can now choose to publish it.',
    ),
  ).toBeInTheDocument();

  expect(
    screen.getByRole('button', {
      name: 'Publish profile',
    }),
  ).toBeEnabled();
});

test('does not claim publication succeeded when API fails', async () => {
  vi.mocked(profileApi.getMine).mockResolvedValue({
    profile: readyProfile,
  });

  vi.mocked(profileApi.publish).mockRejectedValue(
    new ApiError('Profile changed. Refresh and try again.', 409),
  );

  renderManagement();

  await screen.findByRole('heading', {
    name: 'Ready to publish',
  });

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Publish profile',
    }),
  );

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Confirm publish',
    }),
  );

  expect(
    await screen.findByRole('alert'),
  ).toHaveTextContent(
    'Profile changed. Refresh and try again.',
  );

  expect(
    screen.getByRole('heading', {
      name: 'Ready to publish',
    }),
  ).toBeInTheDocument();

  expect(
    screen.queryByRole('link', {
      name: 'View public profile',
    }),
  ).not.toBeInTheDocument();
});

test('renders published professional information', async () => {
  vi.mocked(profileApi.getPublic).mockResolvedValue({
    profile: {
      username: 'testfreelancer',
      headline: 'Professional Software Developer',
      bio: 'I develop reliable applications for businesses worldwide.',
      city: 'Dubai',
      countryCode: 'AE',
      websiteUrl: 'https://example.com',
      projects: [],
      skills: [],
    },
  });

  renderPublic();

  expect(
    await screen.findByRole('heading', {
      name: 'Professional Software Developer',
    }),
  ).toBeInTheDocument();

  expect(
    screen.getByText('@testfreelancer'),
  ).toBeInTheDocument();

  expect(
    screen.getByRole('link', {
      name: 'Visit website',
    }),
  ).toHaveAttribute('href', 'https://example.com/');

  expect(
    screen.queryByText('test@example.com'),
  ).not.toBeInTheDocument();
});

test('does not expose unpublished profiles', async () => {
  vi.mocked(profileApi.getPublic).mockRejectedValue(
    new ApiError('Profile not found.', 404),
  );

  renderPublic();

  expect(
    await screen.findByRole('heading', {
      name: 'Profile unavailable',
    }),
  ).toBeInTheDocument();

  expect(
    screen.queryByRole('heading', {
      name: 'Professional Software Developer',
    }),
  ).not.toBeInTheDocument();
});

test('recovers from a temporary public API failure', async () => {
  vi.mocked(profileApi.getPublic)
    .mockRejectedValueOnce(
      new ApiError('Unable to connect to the server.', 0),
    )
    .mockResolvedValue({
      profile: {
        username: 'testfreelancer',
        headline: 'Professional Software Developer',
        bio: null,
        city: null,
        countryCode: null,
        websiteUrl: null,
        projects: [],
        skills: [],
      },
    });

  renderPublic();

  expect(
    await screen.findByRole('heading', {
      name: 'Unable to load profile',
    }),
  ).toBeInTheDocument();

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Try again',
    }),
  );

  expect(
    await screen.findByRole('heading', {
      name: 'Professional Software Developer',
    }),
  ).toBeInTheDocument();

  expect(profileApi.getPublic).toHaveBeenCalledTimes(2);
});


test('displays featured projects, technologies and skills', async () => {
  vi.mocked(profileApi.getPublic).mockResolvedValue({
    profile: {
      username: 'testfreelancer',
      headline: 'Professional Software Developer',
      bio: 'I build professional applications for clients.',
      city: 'Dubai',
      countryCode: 'AE',
      websiteUrl: null,
      projects: [
        {
          slug: 'featured-work',
          title: 'Featured Research Dashboard',
          summary: 'A dashboard for research results.',
          description: 'Built using React and TypeScript.',
          role: 'Lead Developer',
          projectUrl: 'https://example.com/project',
          sourceUrl: null,
          technologies: ['React', 'TypeScript'],
          startedOn: '2026-01-01T00:00:00.000Z',
          endedOn: null,
          isFeatured: true,
        },
        {
          slug: 'second-work',
          title: 'Laboratory Management System',
          summary: null,
          description: null,
          role: null,
          projectUrl: 'javascript:alert(1)',
          sourceUrl: null,
          technologies: ['PostgreSQL'],
          startedOn: null,
          endedOn: null,
          isFeatured: false,
        },
      ],
      skills: [
        { name: 'React' },
        { name: 'Molecular Biology' },
        { name: 'Python' },
      ],
    },
  });

  renderPublic();

  expect(
    await screen.findByRole('heading', {
      name: 'Portfolio projects',
    }),
  ).toBeInTheDocument();

  const projectTitles = Array.from(
    document.querySelectorAll(
      '.public-portfolio-project h3',
    ),
  ).map((node) => node.textContent);

  expect(projectTitles).toEqual([
    'Featured Research Dashboard',
    'Laboratory Management System',
  ]);

  expect(screen.getByText('Featured')).toBeInTheDocument();
  expect(screen.getByText('TypeScript')).toBeInTheDocument();

  expect(
    screen.getByRole('link', { name: 'View project' }),
  ).toHaveAttribute(
    'href',
    'https://example.com/project',
  );

  // Unsafe external URLs must not become links.
  expect(
    screen.getAllByRole('link', { name: 'View project' }),
  ).toHaveLength(1);

  const displayedSkills = Array.from(
    document.querySelectorAll(
      '.public-portfolio-skills li',
    ),
  ).map((node) => node.textContent);

  expect(displayedSkills).toEqual([
    'React',
    'Molecular Biology',
    'Python',
  ]);
});

test('handles published profiles without portfolio content', async () => {
  vi.mocked(profileApi.getPublic).mockResolvedValue({
    profile: {
      username: 'testfreelancer',
      headline: 'Professional Software Developer',
      bio: null,
      city: null,
      countryCode: null,
      websiteUrl: null,
      projects: [],
      skills: [],
    },
  });

  renderPublic();

  expect(
    await screen.findByRole('heading', {
      name: 'Professional Software Developer',
    }),
  ).toBeInTheDocument();

  expect(
    screen.queryByRole('heading', {
      name: 'Portfolio projects',
    }),
  ).not.toBeInTheDocument();

  expect(
    screen.queryByRole('heading', {
      name: 'Professional skills',
    }),
  ).not.toBeInTheDocument();
});
