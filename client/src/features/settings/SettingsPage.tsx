import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

export function SettingsPage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <main className="onboarding-layout">
      <div className="onboarding-container">
        <header className="onboarding-header">
          <p className="eyebrow">Account settings</p>
          <h1>Settings</h1>
          <p className="auth-description">
            Review your account and manage your
            professional presence.
          </p>
        </header>

        <section className="onboarding-card">
          <h2>Account information</h2>

          <dl className="account-details">
            <dt>Name</dt>
            <dd>{user.displayName}</dd>

            <dt>Email</dt>
            <dd>{user.email}</dd>
          </dl>
        </section>

        <section
          className="onboarding-card"
          style={{ marginTop: 20 }}
        >
          <h2>Portfolio preferences</h2>

          <p className="auth-description">
            Your public portfolio information and publishing
            preferences are managed from your profile workspace.
          </p>

          <div className="onboarding-actions">
            <Link
              to="/profile"
              className="primary-button"
            >
              Manage profile
            </Link>

            <Link
              to="/portfolio"
              className="secondary-button"
            >
              Manage projects and skills
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
