import {
  beforeEach,
  expect,
  test,
  vi,
} from 'vitest';

import * as matchers from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom/vitest';

// Register DOM-specific matchers with Vitest.
expect.extend(matchers);


import '@testing-library/jest-dom/vitest';

import {
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

import { useAuth } from '../features/auth/useAuth';
import { AppShell } from './AppShell';

vi.mock('../features/auth/useAuth', () => ({
  useAuth: vi.fn(),
}));

const logoutMock = vi.fn<() => Promise<void>>();

function renderWorkspace() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route
            path="/dashboard"
            element={<h1>Dashboard content</h1>}
          />

          <Route
            path="/settings"
            element={<h1>Settings content</h1>}
          />

          <Route
            path="/help"
            element={<h1>Help content</h1>}
          />
        </Route>

        <Route
          path="/login"
          element={<h1>Sign in screen</h1>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();

  logoutMock.mockResolvedValue(undefined);

  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: 'test-user',
      displayName: 'Alex Morgan',
      email: 'alex@example.com',
    },
    logout: logoutMock,
  } as unknown as ReturnType<typeof useAuth>);
});

test('renders sidebar navigation and account controls', () => {
  renderWorkspace();

  const mainNavigation = screen.getByRole(
    'navigation',
    { name: 'Main navigation' },
  );

  const accountNavigation = screen.getByRole(
    'navigation',
    { name: 'Account navigation' },
  );

  expect(
    within(mainNavigation).getByRole('link', {
      name: 'Dashboard',
    }),
  ).toHaveAttribute('href', '/dashboard');

  expect(
    within(mainNavigation).getByRole('link', {
      name: 'My Portfolio',
    }),
  ).toHaveAttribute('href', '/portfolio');

  expect(
    within(accountNavigation).getByRole('link', {
      name: 'Settings',
    }),
  ).toHaveAttribute('href', '/settings');

  expect(
    within(accountNavigation).getByRole('link', {
      name: 'Help',
    }),
  ).toHaveAttribute('href', '/help');

  expect(
    screen.getByRole('link', {
      name: 'Open your profile',
    }),
  ).toHaveAttribute('href', '/profile');
});

test('navigates through the account sidebar', async () => {
  renderWorkspace();

  const accountNavigation = screen.getByRole(
    'navigation',
    { name: 'Account navigation' },
  );

  fireEvent.click(
    within(accountNavigation).getByRole('link', {
      name: 'Settings',
    }),
  );

  expect(
    await screen.findByRole('heading', {
      name: 'Settings content',
    }),
  ).toBeInTheDocument();
});

test('top bar sign out revokes the session', async () => {
  renderWorkspace();

  const topBar = screen.getByRole('banner', {
    name: 'Workspace top bar',
  });

  fireEvent.click(
    within(topBar).getByRole('button', {
      name: 'Sign out',
    }),
  );

  expect(
    await screen.findByRole('heading', {
      name: 'Sign in screen',
    }),
  ).toBeInTheDocument();

  expect(logoutMock).toHaveBeenCalledTimes(1);
});

test('sidebar sign out uses the same logout function', async () => {
  renderWorkspace();

  const accountNavigation = screen.getByRole(
    'navigation',
    { name: 'Account navigation' },
  );

  fireEvent.click(
    within(accountNavigation).getByRole('button', {
      name: 'Sign out',
    }),
  );

  expect(
    await screen.findByRole('heading', {
      name: 'Sign in screen',
    }),
  ).toBeInTheDocument();

  expect(logoutMock).toHaveBeenCalledTimes(1);
});

test('does not claim logout succeeded after a failure', async () => {
  logoutMock.mockRejectedValue(
    new Error('Unable to reach the server.'),
  );

  renderWorkspace();

  fireEvent.click(
    within(screen.getByRole('banner', {
            name: 'Workspace top bar',
          })).getByRole('button', { name: 'Sign out' },
    ),
  );

  expect(
    await screen.findByRole('alert'),
  ).toHaveTextContent(
    'Unable to reach the server.',
  );

  expect(
    screen.getByRole('heading', {
      name: 'Dashboard content',
    }),
  ).toBeInTheDocument();

  expect(
    screen.queryByRole('heading', {
      name: 'Sign in screen',
    }),
  ).not.toBeInTheDocument();
});
