
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { useAuth } from './useAuth';

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, status } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'authenticated') {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setError(null);

    if (!displayName.trim()) {
      setError('Please enter your name.');
      return;
    }

    if (password.length < 15 || password.length > 128) {
      setError('Your password must contain 15–128 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      await register({
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
        password,
      });

      navigate('/login', {
        replace: true,
        state: { registrationSuccess: true },
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Registration failed. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-card" aria-labelledby="register-title">
        <Link className="brand" to="/">Freelancer Platform</Link>

        <p className="eyebrow">Get started</p>
        <h1 id="register-title">Create your account</h1>
        <p className="auth-description">
          Build your professional presence and showcase your work.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-field">
            <label htmlFor="register-name">Full name</label>
            <input
              id="register-name"
              type="text"
              autoComplete="name"
              value={displayName}
              maxLength={120}
              required
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Enter your name"
              disabled={submitting}
            />
          </div>

          <div className="form-field">
            <label htmlFor="register-email">Email address</label>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
              value={email}
              maxLength={320}
              required
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              disabled={submitting}
            />
          </div>

          <div className="form-field">
            <label htmlFor="register-password">Password</label>
            <input
              id="register-password"
              type="password"
              autoComplete="new-password"
              value={password}
              minLength={15}
              maxLength={128}
              required
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Create a strong password"
              aria-describedby="password-hint"
              disabled={submitting}
            />
            <small id="password-hint">
              Use at least 15 characters.
            </small>
          </div>

          <div className="form-field">
            <label htmlFor="register-confirm">
              Confirm password
            </label>
            <input
              id="register-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              required
              onChange={(event) =>
                setConfirmPassword(event.target.value)
              }
              placeholder="Repeat your password"
              disabled={submitting}
            />
          </div>

          {error && (
            <div className="form-alert form-alert--error" role="alert">
              {error}
            </div>
          )}

          <button
            className="primary-button"
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
