import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

export function DashboardPage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <main className="dashboard-page">
      <div className="dashboard-main">
        <header className="dashboard-heading">
          <p className="eyebrow">
            My workspace
          </p>

          <h1>Welcome, {user.displayName}</h1>

          <p className="auth-description">
            Manage your professional presence
            from one place.
          </p>
        </header>

        <div className="dashboard-grid">
          <section className="dashboard-panel">
            <h2>My account</h2>

            <p>
              Your account is active and authenticated.
            </p>

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
              Build your professional identity,
              introduce your work, and manage
              your public presence.
            </p>

            <Link
              className="primary-button"
              to="/profile"
            >
              Manage freelancer profile
            </Link>
          </section>

          <section className="dashboard-panel">
            <h2>My portfolio</h2>

            <p>
              Showcase your projects and
              professional skills to clients.
            </p>

            <Link
              className="primary-button"
              to="/portfolio"
            >
              Manage portfolio
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
