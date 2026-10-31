import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { onboardingApi } from './onboarding.api';

import type {
  FreelancerProfile,
  ProfileDraftInput,
} from './onboarding.types';

interface DraftForm {
  headline: string;
  bio: string;
  city: string;
  countryCode: string;
  websiteUrl: string;
}

type Action =
  | 'checking'
  | 'reserving'
  | 'saving'
  | 'completing'
  | null;

const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,29}$/;

function toForm(profile: FreelancerProfile | null): DraftForm {
  return {
    headline: profile?.headline ?? '',
    bio: profile?.bio ?? '',
    city: profile?.city ?? '',
    countryCode: profile?.countryCode ?? '',
    websiteUrl: profile?.websiteUrl ?? '',
  };
}

function toDraft(form: DraftForm): ProfileDraftInput {
  const optional = (value: string) => value.trim() || null;

  return {
    headline: optional(form.headline),
    bio: optional(form.bio),
    city: optional(form.city),
    countryCode: optional(form.countryCode.toUpperCase()),
    websiteUrl: optional(form.websiteUrl),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
}

export function OnboardingPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<FreelancerProfile | null>(null);

  const [username, setUsername] = useState('');
  const [availability, setAvailability] = useState<{
    username: string;
    available: boolean;
  } | null>(null);

  const [form, setForm] = useState<DraftForm>(toForm(null));
  const [action, setAction] = useState<Action>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void onboardingApi.getProfile()
      .then((result) => {
        if (!active) return;

        setProfile(result.profile);
        setForm(toForm(result.profile));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;

        setLoadError(errorMessage(err));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function retryLoad() {
    setLoading(true);
    setLoadError(null);

    try {
      const result = await onboardingApi.getProfile();

      setProfile(result.profile);
      setForm(toForm(result.profile));
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const normalizedUsername = username.trim().toLowerCase();
  const busy = action !== null;

  function updateField(field: keyof DraftForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setError(null);
    setNotice(null);
  }

  async function handleCheckUsername() {
    if (busy) return;

    setAvailability(null);
    setError(null);

    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      setError(
        'Use 3–30 characters, start with a letter, and use only letters, numbers or underscores.',
      );
      return;
    }

    setAction('checking');

    try {
      const result = await onboardingApi.checkUsername(
        normalizedUsername,
      );

      setAvailability(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAction(null);
    }
  }

  async function handleReserve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setError(null);
    setNotice(null);

    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      setError('Please enter a valid username.');
      return;
    }

    setAction('reserving');

    try {
      await onboardingApi.reserveUsername(normalizedUsername);

      // Read the authoritative record after reservation.
      const result = await onboardingApi.getProfile();

      if (!result.profile?.username) {
        throw new Error('Unable to load the reserved profile.');
      }

      setProfile(result.profile);
      setForm(toForm(result.profile));
      setNotice('Username reserved successfully.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAction(null);
    }
  }

  async function persistDraft(finish: boolean) {
    if (busy) return;

    setError(null);
    setNotice(null);

    const draft = toDraft(form);

    if (finish) {
      if (!draft.headline || draft.headline.length < 10) {
        setError('Your headline must contain at least 10 characters.');
        return;
      }

      if (!draft.bio || draft.bio.length < 30) {
        setError('Your biography must contain at least 30 characters.');
        return;
      }

      if (
        !draft.countryCode ||
        !/^[A-Z]{2}$/.test(draft.countryCode)
      ) {
        setError('Enter a valid two-letter country code.');
        return;
      }
    }

    setAction(finish ? 'completing' : 'saving');

    try {
      const saved = await onboardingApi.saveDraft(draft);
      setProfile(saved.profile);

      if (finish) {
        await onboardingApi.completeOnboarding();

        navigate('/dashboard', {
          replace: true,
          state: { onboardingCompleted: true },
        });
      } else {
        setNotice('Your draft has been saved.');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAction(null);
    }
  }

  if (loading) {
    return (
      <main className="page-message" role="status">
        Loading your freelancer profile…
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="page-message">
        <h1>Unable to load your profile</h1>
        <p role="alert">{loadError}</p>
        <button
          type="button"
          className="primary-button"
          onClick={() => void retryLoad()}
        >
          Try again
        </button>
      </main>
    );
  }

  const hasUsername = Boolean(profile?.username);
  const completed = Boolean(profile?.onboardingCompletedAt);

  return (
    <main className="onboarding-layout">
      <div className="onboarding-container">
        <header className="onboarding-header">
          <Link to="/dashboard" className="brand">
            Freelancer Platform
          </Link>

          <p className="eyebrow">Freelancer setup</p>
          <h1>Create your professional profile</h1>
          <p className="auth-description">
            Set up your professional identity and save your
            progress. Your profile stays private until published.
          </p>
        </header>

        <div className="onboarding-progress">
          <div className="onboarding-progress-item">
            <span className={hasUsername ? 'step-done' : 'step-active'}>
              1
            </span>
            <span>Username</span>
          </div>

          <div className="onboarding-progress-item">
            <span className={completed ? 'step-done' : 'step-active'}>
              2
            </span>
            <span>Professional details</span>
          </div>
        </div>

        {error && (
          <div className="form-alert form-alert--error" role="alert">
            {error}
          </div>
        )}

        {notice && (
          <div className="form-alert form-alert--success" role="status">
            {notice}
          </div>
        )}

        {completed ? (
          <section className="onboarding-card">
            <h2>Onboarding completed</h2>

            <p>
              Your professional information has been saved.
              Your profile is still private.
            </p>

            <p>
              Reserved username: <strong>{profile?.username}</strong>
            </p>

            <div className="onboarding-actions">
              <Link className="primary-button" to="/dashboard">
                Return to dashboard
              </Link>

              <Link className="secondary-button" to="/profile">
                Manage your profile
              </Link>
            </div>
          </section>
        ) : profile?.status === 'PUBLISHED' ? (
          <section className="onboarding-card">
            <h2>Profile already published</h2>
            <p>
              Published profile editing will be available in
              the profile management module.
            </p>
            <Link className="secondary-button" to="/dashboard">
              Back to dashboard
            </Link>
          </section>
        ) : !hasUsername ? (
          <section className="onboarding-card">
            <h2>Step 1 — Choose your username</h2>
            <p className="auth-description">
              Your username will identify your public profile
              after you choose to publish it.
            </p>

            <form className="auth-form" onSubmit={handleReserve}>
              <div className="form-field">
                <label htmlFor="profile-username">
                  Username
                </label>

                <input
                  id="profile-username"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setAvailability(null);
                    setError(null);
                  }}
                  placeholder="your_name"
                  minLength={3}
                  maxLength={30}
                  autoComplete="off"
                  spellCheck={false}
                  required
                  disabled={busy}
                />

                <small>
                  Letters, numbers and underscores only.
                  Must begin with a letter.
                </small>
              </div>

              <div className="username-preview">
                Future URL: /u/{normalizedUsername || 'your_name'}
              </div>

              {availability?.username === normalizedUsername && (
                <p role="status">
                  {availability.available
                    ? 'Username is available.'
                    : 'Username is unavailable.'}
                </p>
              )}

              <div className="onboarding-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleCheckUsername()}
                  disabled={busy}
                >
                  {action === 'checking'
                    ? 'Checking…'
                    : 'Check availability'}
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={busy}
                >
                  {action === 'reserving'
                    ? 'Reserving…'
                    : 'Reserve username'}
                </button>
              </div>
            </form>
          </section>
        ) : (
          <section className="onboarding-card">
            <h2>Step 2 — Professional details</h2>

            <p>
              Reserved username: <strong>{profile?.username}</strong>
            </p>

            <p className="auth-description">
              Tell potential clients about your professional
              experience, expertise and services.
            </p>

            <form
              className="auth-form"
              onSubmit={(event) => {
                event.preventDefault();
                void persistDraft(false);
              }}
            >
              <div className="form-field">
                <label htmlFor="profile-headline">
                  Professional headline *
                </label>
                <input
                  id="profile-headline"
                  value={form.headline}
                  maxLength={160}
                  onChange={(event) =>
                    updateField('headline', event.target.value)
                  }
                  placeholder="Full-stack Developer | SaaS Specialist"
                  disabled={busy}
                />
                <small>At least 10 characters to complete onboarding.</small>
              </div>

              <div className="form-field">
                <label htmlFor="profile-bio">
                  Professional biography *
                </label>
                <textarea
                  id="profile-bio"
                  value={form.bio}
                  maxLength={5000}
                  rows={6}
                  onChange={(event) =>
                    updateField('bio', event.target.value)
                  }
                  placeholder="Describe your experience, strengths and services."
                  disabled={busy}
                />
                <small>
                  {form.bio.length}/5000 characters.
                  At least 30 are required to finish.
                </small>
              </div>

              <div className="onboarding-two-columns">
                <div className="form-field">
                  <label htmlFor="profile-country">
                    Country code *
                  </label>
                  <input
                    id="profile-country"
                    value={form.countryCode}
                    maxLength={2}
                    placeholder="AE"
                    autoComplete="off"
                    onChange={(event) =>
                      updateField(
                        'countryCode',
                        event.target.value.toUpperCase(),
                      )
                    }
                    disabled={busy}
                  />
                  <small>ISO two-letter country code.</small>
                </div>

                <div className="form-field">
                  <label htmlFor="profile-city">City</label>
                  <input
                    id="profile-city"
                    value={form.city}
                    maxLength={100}
                    placeholder="Dubai"
                    onChange={(event) =>
                      updateField('city', event.target.value)
                    }
                    disabled={busy}
                  />
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="profile-website">
                  Professional website
                </label>
                <input
                  id="profile-website"
                  type="url"
                  value={form.websiteUrl}
                  maxLength={2048}
                  placeholder="https://example.com"
                  onChange={(event) =>
                    updateField('websiteUrl', event.target.value)
                  }
                  disabled={busy}
                />
              </div>

              <div className="onboarding-actions">
                <button
                  className="secondary-button"
                  type="submit"
                  disabled={busy}
                >
                  {action === 'saving'
                    ? 'Saving…'
                    : 'Save draft'}
                </button>

                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void persistDraft(true)}
                  disabled={busy}
                >
                  {action === 'completing'
                    ? 'Completing…'
                    : 'Complete onboarding'}
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
