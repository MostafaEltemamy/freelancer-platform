import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';

import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { useAuth } from './features/auth/useAuth';

import { DashboardPage } from './features/dashboard/DashboardPage';
import { OnboardingPage } from './features/onboarding/OnboardingPage';

import { ProfileManagementPage } from './features/profile/ProfileManagementPage';
import { PublicProfilePage } from './features/profile/PublicProfilePage';

import { PortfolioManagementPage } from './features/portfolio/PortfolioManagementPage';

import { SettingsPage } from './features/settings/SettingsPage';
import { HelpPage } from './features/help/HelpPage';

import { AppShell } from './layouts/AppShell';

function HomePage() {
  const { status, error, refresh } = useAuth();

  if (status === 'loading') {
    return (
      <main className="page-message" role="status">
        Loading…
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="page-message">
        <h1>Unable to connect</h1>

        <p role="alert">{error}</p>

        <button
          type="button"
          className="primary-button"
          onClick={() => void refresh()}
        >
          Try again
        </button>
      </main>
    );
  }

  const isAuthenticated = status === 'authenticated';

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <p className="eyebrow">
          Freelancer Platform
        </p>

        <h1>
          Your professional identity,
          all in one place.
        </h1>

        <p className="auth-description">
          Showcase your work, build your reputation,
          and connect with clients.
        </p>

        <div className="home-actions">
          <Link
            className="primary-button"
            to={
              isAuthenticated
                ? '/dashboard'
                : '/register'
            }
          >
            {isAuthenticated
              ? 'Go to dashboard'
              : 'Get started'}
          </Link>

          {!isAuthenticated && (
            <Link
              className="secondary-button"
              to="/login"
            >
              Sign in
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public application routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Authenticated freelancer workspace */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route
              path="/dashboard"
              element={<DashboardPage />}
            />

            <Route
              path="/onboarding"
              element={<OnboardingPage />}
            />

            <Route
              path="/profile"
              element={<ProfileManagementPage />}
            />

            <Route
              path="/portfolio"
              element={<PortfolioManagementPage />}
            />

            <Route
              path="/settings"
              element={<SettingsPage />}
            />

            <Route
              path="/help"
              element={<HelpPage />}
            />
          </Route>
        </Route>

        {/* Public profiles never require authentication. */}
        <Route
          path="/u/:username"
          element={<PublicProfilePage />}
        />

        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}
