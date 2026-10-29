
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';

import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { useAuth } from './features/auth/useAuth';

function ProtectedDashboard() {
  const { user, status, error, logout, refresh } = useAuth();

  if (status === 'loading') {
    return <main className="page-message">Checking your session…</main>;
  }

  if (status === 'error') {
    return (
      <main className="page-message">
        <h1>Unable to verify your session</h1>
        <p>{error}</p>
        <button type="button" onClick={() => void refresh()}>
          Try again
        </button>
      </main>
    );
  }

  if (status !== 'authenticated' || !user) {
    return <Navigate to="/login" replace />;
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // AuthProvider preserves the error and authenticated state.
    }
  }

  return (
    <main className="dashboard-page">
      <nav className="dashboard-nav">
        <Link className="brand" to="/">Freelancer Platform</Link>

        <button
          className="secondary-button"
          type="button"
          onClick={() => void handleLogout()}
        >
          Sign out
        </button>
      </nav>

      <section className="dashboard-card">
        <p className="eyebrow">Your workspace</p>
        <h1>Welcome, {user.displayName}!</h1>
        <p className="auth-description">
          You're signed in successfully.
        </p>
        <p><strong>Email:</strong> {user.email}</p>
        <p>
          Your freelancer dashboard and portfolio tools
          will be developed in the next steps.
        </p>

        {error && (
          <div className="form-alert form-alert--error" role="alert">
            {error}
          </div>
        )}
      </section>
    </main>
  );
}

function HomePage() {
  const { status } = useAuth();

  if (status === 'loading') {
    return <main className="page-message">Loading…</main>;
  }

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <p className="eyebrow">Freelancer Platform</p>
        <h1>Your professional identity, all in one place.</h1>
        <p className="auth-description">
          Showcase your work, build your reputation,
          and connect with clients.
        </p>

        <div className="home-actions">
          <Link className="primary-button" to={
            status === 'authenticated' ? '/dashboard' : '/register'
          }>
            {status === 'authenticated'
              ? 'Go to dashboard'
              : 'Get started'}
          </Link>

          {status !== 'authenticated' && (
            <Link className="secondary-button" to="/login">
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
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/dashboard"
          element={<ProtectedDashboard />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
