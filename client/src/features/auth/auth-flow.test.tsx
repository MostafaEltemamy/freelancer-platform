import { beforeEach, expect, test, vi } from 'vitest';

import * as matchers from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom/vitest';

// Explicitly register Testing Library matchers with Vitest.
expect.extend(matchers);

import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';

import {
  MemoryRouter,
  Route,
  Routes,
} from 'react-router-dom';

import { AuthProvider } from './AuthProvider';
import { LoginPage } from './LoginPage';
import { ProtectedRoute } from './ProtectedRoute';

import { DashboardPage } from '../dashboard/DashboardPage';
import { AppShell } from '../../layouts/AppShell';

import { authApi } from './auth.api';
import { ApiError } from '../../lib/api-client';

import type { AuthUser } from './auth.types';

// Mock backend API calls.
// Tests do not connect to the real server.
vi.mock('./auth.api', () => ({
  authApi: {
    me: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getCsrfToken: vi.fn(),
  },
}));

const testUser: AuthUser = {
  id: 'test-user-id',
  email: 'tester@example.com',
  displayName: 'Test Freelancer',
  createdAt: '2026-10-29T10:00:00.000Z',
};

// Render the real authentication provider and routing.

function renderAuthApp(initialPath = '/dashboard') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          {/* Public login route */}
          <Route
            path="/login"
            element={<LoginPage />}
          />

          {/* Authenticated application */}
          <Route element={<ProtectedRoute />}>
            {/* Shared navigation and sign-out controls */}
            <Route element={<AppShell />}>
              <Route
                path="/dashboard"
                element={<DashboardPage />}
              />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

// Default: no authenticated session.
beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(authApi.me).mockRejectedValue(
    new ApiError('Authentication required.', 401),
  );
});

// TEST 1
test('shows loading while verifying the session', () => {
  vi.mocked(authApi.me).mockImplementation(
    () => new Promise<AuthUser>(() => {}),
  );

  renderAuthApp();

  expect(
    screen.getByText('Checking your session…'),
  ).toBeInTheDocument();
});

// TEST 2
test('redirects unauthenticated users to login', async () => {
  renderAuthApp();

  expect(
    await screen.findByRole('heading', {
      name: 'Sign in to your account',
    }),
  ).toBeInTheDocument();

  expect(
    document.querySelectorAll('form.auth-form'),
  ).toHaveLength(1);

  expect(
    screen.queryByText('My account'),
  ).not.toBeInTheDocument();
});

// TEST 3
test('restores an existing authenticated session', async () => {
  vi.mocked(authApi.me).mockResolvedValue(testUser);

  renderAuthApp();

  expect(
    await screen.findByRole('heading', {
      name: 'Welcome, Test Freelancer',
    }),
  ).toBeInTheDocument();

  expect(
    screen.getByText(testUser.email),
  ).toBeInTheDocument();
});

// TEST 4
test('allows recovery from a temporary API outage', async () => {
  vi.mocked(authApi.me)
    .mockRejectedValueOnce(
      new Error('Backend unavailable'),
    )
    .mockResolvedValue(testUser);

  renderAuthApp();

  expect(
    await screen.findByRole('heading', {
      name: 'Unable to verify your session',
    }),
  ).toBeInTheDocument();

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Try again',
    }),
  );

  expect(
    await screen.findByRole('heading', {
      name: 'Welcome, Test Freelancer',
    }),
  ).toBeInTheDocument();

  expect(authApi.me).toHaveBeenCalledTimes(2);
});

// TEST 5
test('logs in and opens the protected dashboard', async () => {
  vi.mocked(authApi.login).mockResolvedValue({
    message: 'Logged in successfully.',
    user: testUser,
  });

  renderAuthApp('/login');

  await screen.findByRole('heading', {
    name: 'Sign in to your account',
  });

  fireEvent.change(
    screen.getByLabelText('Email address'),
    {
      target: { value: 'TESTER@EXAMPLE.COM' },
    },
  );

  fireEvent.change(
    screen.getByLabelText('Password'),
    {
      target: { value: 'SecureTestPassword2026!' },
    },
  );

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Sign in',
    }),
  );

  expect(
    await screen.findByRole('heading', {
      name: 'Welcome, Test Freelancer',
    }),
  ).toBeInTheDocument();

  expect(authApi.login).toHaveBeenCalledWith({
    email: 'tester@example.com',
    password: 'SecureTestPassword2026!',
  });
});

// TEST 6
test('displays an error for incorrect credentials', async () => {
  vi.mocked(authApi.login).mockRejectedValue(
    new ApiError('Invalid email or password.', 401),
  );

  renderAuthApp('/login');

  await screen.findByRole('heading', {
    name: 'Sign in to your account',
  });

  fireEvent.change(
    screen.getByLabelText('Email address'),
    {
      target: { value: testUser.email },
    },
  );

  fireEvent.change(
    screen.getByLabelText('Password'),
    {
      target: { value: 'WrongPassword123!' },
    },
  );

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Sign in',
    }),
  );

  expect(
    await screen.findByRole('alert'),
  ).toHaveTextContent('Invalid email or password.');

  expect(
    screen.queryByText('My account'),
  ).not.toBeInTheDocument();
});

// TEST 7
test('logs out and removes access to the dashboard', async () => {
  vi.mocked(authApi.me).mockResolvedValue(testUser);
  vi.mocked(authApi.logout).mockResolvedValue(undefined);

  renderAuthApp();

  await screen.findByRole('heading', {
    name: 'Welcome, Test Freelancer',
  });

  fireEvent.click(
    within(
      screen.getByRole('banner', {
        name: 'Workspace top bar',
      }),
    ).getByRole('button', {
      name: 'Sign out',
    }),
  );

  expect(
    await screen.findByRole('heading', {
      name: 'Sign in to your account',
    }),
  ).toBeInTheDocument();

  expect(authApi.logout).toHaveBeenCalledTimes(1);

  expect(
    screen.queryByText('My account'),
  ).not.toBeInTheDocument();
});

// TEST 8
test('does not claim logout succeeded when it fails', async () => {
  vi.mocked(authApi.me).mockResolvedValue(testUser);

  vi.mocked(authApi.logout).mockRejectedValue(
    new Error('Backend unavailable'),
  );

  renderAuthApp();

  await screen.findByRole('heading', {
    name: 'Welcome, Test Freelancer',
  });

  fireEvent.click(
    within(
      screen.getByRole('banner', {
        name: 'Workspace top bar',
      }),
    ).getByRole('button', {
      name: 'Sign out',
    }),
  );

  expect(
    await screen.findByRole('alert'),
  ).toHaveTextContent('Backend unavailable');

  expect(
    screen.getByRole('heading', {
      name: 'Welcome, Test Freelancer',
    }),
  ).toBeInTheDocument();
});

// Test 9
test('preserves unsaved form data when browser regains focus', async () => {
  let finishRecheck: (user: AuthUser) => void = () => {};

  const pendingRecheck = new Promise<AuthUser>((resolve) => {
    finishRecheck = resolve;
  });

  vi.mocked(authApi.me)
    .mockResolvedValueOnce(testUser)
    .mockImplementationOnce(() => pendingRecheck);

  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/draft']}>
        <Routes>
          <Route path="/draft" element={<ProtectedRoute />}>
            <Route
              index
              element={
                <input aria-label="Unsaved project title" />
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

  const input = await screen.findByRole('textbox', {
    name: 'Unsaved project title',
  });

  fireEvent.change(input, {
    target: { value: 'My unfinished portfolio project' },
  });

  // Simulate returning to the browser.
  fireEvent.focus(window);

  expect(authApi.me).toHaveBeenCalledTimes(2);

  // The same input must remain mounted while the
  // authentication request is still pending.
  expect(
    screen.getByRole('textbox', {
      name: 'Unsaved project title',
    }),
  ).toBe(input);

  expect(input).toHaveValue(
    'My unfinished portfolio project',
  );

  await act(async () => {
    finishRecheck(testUser);
  });

  expect(input).toHaveValue(
    'My unfinished portfolio project',
  );
});
