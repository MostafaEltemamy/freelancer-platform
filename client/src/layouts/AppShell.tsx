import { useState } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import { useAuth } from '../features/auth/useAuth';
import './app-shell.css';

const BRAND_NAME = 'Freelancer Platform';

const MAIN_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/portfolio', label: 'My Portfolio' },
  { to: '/profile', label: 'My Profile' },
] as const;

const ACCOUNT_LINKS = [
  { to: '/settings', label: 'Settings' },
  { to: '/help', label: 'Help' },
] as const;

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/portfolio': 'My Portfolio',
  '/profile': 'My Profile',
  '/onboarding': 'Profile Setup',
  '/settings': 'Settings',
  '/help': 'Help',
};

function initialsFromName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase() || '?';
}

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] =
    useState<string | null>(null);

  if (!user) {
    return null;
  }

  const pageTitle =
    PAGE_TITLES[location.pathname] ?? 'My Workspace';

  async function handleSignOut() {
    if (signingOut) return;

    setSigningOut(true);
    setSignOutError(null);

    try {
      // The existing AuthProvider revokes the server session.
      await logout();

      navigate('/login', {
        replace: true,
        state: { loggedOut: true },
      });
    } catch (error) {
      // Do not claim logout succeeded if revocation failed.
      setSignOutError(
        error instanceof Error
          ? error.message
          : 'Unable to sign out. Please try again.',
      );
    } finally {
      setSigningOut(false);
    }
  }

  function closeMobileNavigation() {
    setMobileOpen(false);
  }

  function navigationClass(isActive: boolean): string {
    return [
      'workspace-nav-link',
      isActive ? 'workspace-nav-link--active' : '',
    ].filter(Boolean).join(' ');
  }

  return (
    <div className="workspace-shell">
      {mobileOpen && (
        <button
          type="button"
          className="workspace-backdrop"
          aria-label="Close navigation"
          onClick={closeMobileNavigation}
        />
      )}

      <aside
        id="workspace-sidebar"
        className={[
          'workspace-sidebar',
          mobileOpen ? 'workspace-sidebar--open' : '',
        ].filter(Boolean).join(' ')}
        aria-label="Workspace sidebar"
      >
        <div className="workspace-sidebar-header">
          <Link
            className="workspace-brand"
            to="/dashboard"
            onClick={closeMobileNavigation}
          >
            <span
              className="workspace-brand-mark"
              aria-hidden="true"
            >
              F
            </span>

            <span>{BRAND_NAME}</span>
          </Link>

          <button
            type="button"
            className="workspace-mobile-close"
            onClick={closeMobileNavigation}
            aria-label="Close sidebar"
          >
            ×
          </button>
        </div>

        <nav
          className="workspace-navigation"
          aria-label="Main navigation"
        >
          <span className="workspace-nav-heading">
            WORKSPACE
          </span>

          {MAIN_LINKS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                navigationClass(isActive)
              }
              onClick={closeMobileNavigation}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <nav
          className="workspace-navigation workspace-navigation--bottom"
          aria-label="Account navigation"
        >
          <span className="workspace-nav-heading">
            ACCOUNT & SUPPORT
          </span>

          {ACCOUNT_LINKS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                navigationClass(isActive)
              }
              onClick={closeMobileNavigation}
            >
              {item.label}
            </NavLink>
          ))}

          <button
            type="button"
            className="workspace-nav-link workspace-nav-button"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </nav>
      </aside>

      <div className="workspace-area">
      <header
        className="workspace-topbar"
        aria-label="Workspace top bar"
      >
          <div className="workspace-topbar-left">
            <button
              type="button"
              className="workspace-menu-toggle"
              aria-label="Open navigation"
              aria-controls="workspace-sidebar"
              aria-expanded={mobileOpen}
              onClick={() =>
                setMobileOpen((current) => !current)
              }
            >
              ☰
            </button>

            <strong className="workspace-page-title">
              {pageTitle}
            </strong>
          </div>

          <div className="workspace-topbar-right">
            <Link
              to="/profile"
              className="workspace-avatar"
              aria-label="Open your profile"
              title={user.displayName}
              onClick={closeMobileNavigation}
            >
              {initialsFromName(user.displayName)}
            </Link>

            <button
              type="button"
              className="workspace-top-signout"
              disabled={signingOut}
              onClick={() => void handleSignOut()}
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </header>

        <div
          id="workspace-content"
          className="workspace-content"
          tabIndex={-1}
        >
          {signOutError && (
            <div
              className="form-alert form-alert--error workspace-logout-error"
              role="alert"
            >
              {signOutError}
            </div>
          )}

          <Outlet />
        </div>
      </div>
    </div>
  );
}
