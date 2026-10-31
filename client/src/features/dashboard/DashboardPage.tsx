import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';

export function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(
    null,
  );

  if (!user) {
    return null;
  }

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    setLogoutError(null);

    try {
      await logout();

      navigate('/login', {
        replace: true,
        state: { loggedOut: true },
      });
    } catch (error) {
      setLogoutError(
        error instanceof Error
          ? error.message
          : 'Unable to sign out. Please try again.',
      );
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <main className="dashboard-page">
      <nav className="dashboard-nav" aria-label="Dashboard navigation">
        <Link className="brand" to="/">
          Freelancer Platform
        </Link>

        <button
          type="button"
          className="secondary-button"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
        >
          {loggingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </nav>

      <div className="dashboard-main">
        <header className="dashboard-heading">
          <p className="eyebrow">My workspace</p>
          <h1>Welcome, {user.displayName}</h1>
          <p className="auth-description">
            Manage your professional presence from one place.
          </p>
        </header>

        {logoutError && (
          <div
            className="form-alert form-alert--error"
            role="alert"
          >
            {logoutError}
          </div>
        )}

        <div className="dashboard-grid">
          <section className="dashboard-panel">
            <h2>My account</h2>
            <p>Your account is active and authenticated.</p>

            <dl className="account-details">
              <dt>Name</dt>
              <dd>{user.displayName}</dd>

              <dt>Email</dt>
              <dd>{user.email}</dd>
            </dl>
          </section>

          
          <section className="dashboard-panel">
            <h2>My freelancer profile</h2>

            <p>
              Create your professional identity, reserve a unique
              username, and introduce your skills to potential clients.
            </p>

            <Link className="primary-button" to="/onboarding">
              Set up or view profile
            </Link>
          </section>

          <section className="dashboard-panel">
            <h2>My workspace</h2>
            <p>
              Your projects and professional tools
              will be available here.
            </p>
            <span className="feature-label">
              Planned
            </span>
          </section>
        </div>
      </div>
    </main>
  );
}
