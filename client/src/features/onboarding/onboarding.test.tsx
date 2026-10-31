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

import { OnboardingPage } from './OnboardingPage';
import { onboardingApi } from './onboarding.api';

import type { FreelancerProfile } from './onboarding.types';

// Match the existing frontend testing configuration.
expect.extend(matchers);

vi.mock('./onboarding.api', () => ({
  onboardingApi: {
    getProfile: vi.fn(),
    checkUsername: vi.fn(),
    reserveUsername: vi.fn(),
    saveDraft: vi.fn(),
    completeOnboarding: vi.fn(),
  },
}));

const draftProfile: FreelancerProfile = {
  id: 'test-profile-id',
  username: 'testfreelancer',
  headline: null,
  bio: null,
  city: null,
  countryCode: null,
  websiteUrl: null,
  status: 'DRAFT',
  onboardingCompletedAt: null,
  publishedAt: null,
  updatedAt: '2026-10-31T10:00:00.000Z',
};

function renderOnboarding() {
  return render(
    <MemoryRouter initialEntries={['/onboarding']}>
      <Routes>
        <Route
          path="/onboarding"
          element={<OnboardingPage />}
        />

        <Route
          path="/dashboard"
          element={<h1>Dashboard loaded</h1>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(onboardingApi.getProfile).mockResolvedValue({
    profile: null,
  });
});

test('requires username selection for a new profile', async () => {
  renderOnboarding();

  expect(
    await screen.findByRole('heading', {
      name: 'Step 1 — Choose your username',
    }),
  ).toBeInTheDocument();
});

test('checks availability and reserves a username', async () => {
  vi.mocked(onboardingApi.getProfile)
    .mockResolvedValueOnce({ profile: null })
    .mockResolvedValueOnce({ profile: draftProfile });

  vi.mocked(onboardingApi.checkUsername).mockResolvedValue({
    username: 'testfreelancer',
    available: true,
  });

  vi.mocked(onboardingApi.reserveUsername).mockResolvedValue({
    username: 'testfreelancer',
    profilePath: '/u/testfreelancer',
    published: false,
  });

  renderOnboarding();

  await screen.findByRole('heading', {
    name: 'Step 1 — Choose your username',
  });

  fireEvent.change(
    screen.getByLabelText('Username'),
    { target: { value: 'TestFreelancer' } },
  );

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Check availability',
    }),
  );

  expect(
    await screen.findByText('Username is available.'),
  ).toBeInTheDocument();

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Reserve username',
    }),
  );

  expect(
    await screen.findByRole('heading', {
      name: 'Step 2 — Professional details',
    }),
  ).toBeInTheDocument();

  expect(onboardingApi.reserveUsername).toHaveBeenCalledWith(
    'testfreelancer',
  );
});

test('restores saved draft information', async () => {
  vi.mocked(onboardingApi.getProfile).mockResolvedValue({
    profile: {
      ...draftProfile,
      headline: 'Full-stack Developer',
      bio: 'I develop professional applications for businesses.',
      countryCode: 'AE',
    },
  });

  renderOnboarding();

  await screen.findByRole('heading', {
    name: 'Step 2 — Professional details',
  });

  expect(
    screen.getByLabelText('Professional headline *'),
  ).toHaveValue('Full-stack Developer');

  expect(
    screen.getByLabelText('Country code *'),
  ).toHaveValue('AE');
});

test('saves details and completes onboarding', async () => {
  vi.mocked(onboardingApi.getProfile).mockResolvedValue({
    profile: draftProfile,
  });

  vi.mocked(onboardingApi.saveDraft).mockResolvedValue({
    message: 'Profile draft saved.',
    profile: draftProfile,
  });

  vi.mocked(onboardingApi.completeOnboarding).mockResolvedValue({
    message: 'Onboarding completed successfully.',
    profile: {
      ...draftProfile,
      onboardingCompletedAt: '2026-10-31T11:00:00.000Z',
    },
  });

  renderOnboarding();

  await screen.findByRole('heading', {
    name: 'Step 2 — Professional details',
  });

  fireEvent.change(
    screen.getByLabelText('Professional headline *'),
    {
      target: {
        value: 'Experienced Freelance Developer',
      },
    },
  );

  fireEvent.change(
    screen.getByLabelText('Professional biography *'),
    {
      target: {
        value:
          'I design and develop reliable applications for businesses around the world.',
      },
    },
  );

  fireEvent.change(
    screen.getByLabelText('Country code *'),
    {
      target: { value: 'AE' },
    },
  );

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Complete onboarding',
    }),
  );

  expect(
    await screen.findByRole('heading', {
      name: 'Dashboard loaded',
    }),
  ).toBeInTheDocument();

  expect(onboardingApi.saveDraft).toHaveBeenCalledWith(
    expect.objectContaining({
      headline: 'Experienced Freelance Developer',
      countryCode: 'AE',
    }),
  );

  expect(
    onboardingApi.completeOnboarding,
  ).toHaveBeenCalledTimes(1);
});

test('keeps completed profiles private', async () => {
  vi.mocked(onboardingApi.getProfile).mockResolvedValue({
    profile: {
      ...draftProfile,
      onboardingCompletedAt: '2026-10-31T11:00:00.000Z',
    },
  });

  renderOnboarding();

  expect(
    await screen.findByRole('heading', {
      name: 'Onboarding completed',
    }),
  ).toBeInTheDocument();

  expect(
    screen.getByText(/Your profile is still private/),
  ).toBeInTheDocument();

  expect(
    screen.queryByRole('button', {
      name: 'Complete onboarding',
    }),
  ).not.toBeInTheDocument();
});
