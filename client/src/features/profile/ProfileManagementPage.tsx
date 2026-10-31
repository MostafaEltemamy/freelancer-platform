import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { profileApi } from './profile.api';

import type {
  FreelancerProfile,
  ProfileDraftInput,
} from '../onboarding/onboarding.types';

interface ProfileForm {
  headline: string;
  bio: string;
  city: string;
  countryCode: string;
  websiteUrl: string;
}

type Action =
  | 'saving'
  | 'validating'
  | 'publishing'
  | 'unpublishing'
  | null;

type Confirmation = 'publish' | 'unpublish' | null;

function toForm(profile: FreelancerProfile | null): ProfileForm {
  return {
    headline: profile?.headline ?? '',
    bio: profile?.bio ?? '',
    city: profile?.city ?? '',
    countryCode: profile?.countryCode ?? '',
    websiteUrl: profile?.websiteUrl ?? '',
  };
}

function toDraft(form: ProfileForm): ProfileDraftInput {
  const optional = (value: string) => value.trim() || null;

  return {
    headline: optional(form.headline),
    bio: optional(form.bio),
    city: optional(form.city),
    countryCode: optional(form.countryCode.toUpperCase()),
    websiteUrl: optional(form.websiteUrl),
  };
}

function getError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Unable to complete this request.';
}

function validateForCompletion(
  draft: ProfileDraftInput,
): string | null {
  if (!draft.headline || draft.headline.length < 10) {
    return 'The professional headline must contain at least 10 characters.';
  }

  if (!draft.bio || draft.bio.length < 30) {
    return 'The biography must contain at least 30 characters.';
  }

  if (
    !draft.countryCode ||
    !/^[A-Z]{2}$/.test(draft.countryCode)
  ) {
    return 'Enter a valid two-letter country code.';
  }

  return null;
}

export function ProfileManagementPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [profile, setProfile] =
    useState<FreelancerProfile | null>(null);

  const [form, setForm] = useState<ProfileForm>(toForm(null));
  const [action, setAction] = useState<Action>(null);
  const [confirmation, setConfirmation] =
    useState<Confirmation>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void profileApi.getMine()
      .then(({ profile: result }) => {
        if (!active) return;

        setProfile(result);
        setForm(toForm(result));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;

        setLoadError(getError(err));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function reloadProfile() {
    if (action) return;

    setLoading(true);
    setLoadError(null);
    setError(null);
    setNotice(null);
    setConfirmation(null);

    try {
      const result = await profileApi.getMine();

      setProfile(result.profile);
      setForm(toForm(result.profile));
    } catch (err) {
      setLoadError(getError(err));
    } finally {
      setLoading(false);
    }
  }

  function updateField(field: keyof ProfileForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setError(null);
    setNotice(null);
    setConfirmation(null);
  }

  const draft = toDraft(form);

  const fields: (keyof ProfileDraftInput)[] = [
    'headline',
    'bio',
    'city',
    'countryCode',
    'websiteUrl',
  ];

  const hasChanges = profile !== null &&
    fields.some((field) => draft[field] !== profile[field]);

  const published = profile?.status === 'PUBLISHED';
  const completed = Boolean(profile?.onboardingCompletedAt);
  const busy = action !== null;

  const readyToPublish =
    profile?.status === 'DRAFT' &&
    completed &&
    !hasChanges;

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!profile || published || busy || !hasChanges) {
      return;
    }

    setAction('saving');
    setError(null);
    setNotice(null);
    setConfirmation(null);

    try {
      const result = await profileApi.saveDraft(draft);

      setProfile(result.profile);
      setForm(toForm(result.profile));

      setNotice(
        completed
          ? 'Changes saved. Validate your profile again before publishing.'
          : 'Profile draft saved successfully.',
      );
    } catch (err) {
      setError(getError(err));
    } finally {
      setAction(null);
    }
  }

  async function handleComplete() {
    if (!profile || published || busy || hasChanges) return;

    setError(null);
    setNotice(null);

    const validationError = validateForCompletion(draft);

    if (validationError) {
      setError(validationError);
      return;
    }

    setAction('validating');

    try {
      const result = await profileApi.completeOnboarding();

      setProfile(result.profile);
      setForm(toForm(result.profile));

      setNotice(
        'Profile validated. You can now choose to publish it.',
      );
    } catch (err) {
      setError(getError(err));
    } finally {
      setAction(null);
    }
  }

  async function handleVisibilityChange() {
    if (!profile || !confirmation || busy) return;

    const operation = confirmation;

    if (
      (operation === 'publish' && !readyToPublish) ||
      (operation === 'unpublish' && !published)
    ) {
      setConfirmation(null);
      return;
    }

    setAction(
      operation === 'publish' ? 'publishing' : 'unpublishing',
    );

    setError(null);
    setNotice(null);

    try {
      const result = operation === 'publish'
        ? await profileApi.publish()
        : await profileApi.unpublish();

      setProfile(result.profile);
      setForm(toForm(result.profile));
      setConfirmation(null);

      setNotice(
        operation === 'publish'
          ? 'Your freelancer profile is now public.'
          : 'Your profile is private again.',
      );
    } catch (err) {
      setError(getError(err));
      setConfirmation(null);
    } finally {
      setAction(null);
    }
  }

  if (loading) {
    return (
      <main className="page-message" role="status">
        Loading your profile…
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
          onClick={() => {
            if (
              hasChanges &&
              !window.confirm('Discard your unsaved changes?')
            ) {
              return;
            }

            void reloadProfile();
          }}

        >
          Try again
        </button>
      </main>
    );
  }

  if (!profile?.username) {
    return (
      <main className="onboarding-layout">
        <div className="onboarding-container">
          <Link className="brand" to="/dashboard">
            Freelancer Platform
          </Link>

          <section className="onboarding-card">
            <p className="eyebrow">My profile</p>
            <h1>Set up your freelancer profile</h1>
            <p>
              Reserve your username and complete your
              professional information to get started.
            </p>

            <Link className="primary-button" to="/onboarding">
              Start onboarding
            </Link>
          </section>
        </div>
      </main>
    );
  }

  const statusLabel = published
    ? 'Published'
    : completed
      ? 'Ready to publish'
      : 'Draft — setup incomplete';

  return (
    <main className="onboarding-layout">
      <div className="onboarding-container">
        <header className="onboarding-header">
          <Link className="brand" to="/dashboard">
            Freelancer Platform
          </Link>

          <p className="eyebrow">Profile management</p>
          <h1>Manage your freelancer profile</h1>

          <p className="auth-description">
            Update your professional information and
            control when your profile is publicly visible.
          </p>
        </header>

        <section className="onboarding-card profile-status-panel">
          <div>
            <p className="eyebrow">Publication status</p>
            <h2>{statusLabel}</h2>
            <p>
              Username: <strong>@{profile.username}</strong>
            </p>
          </div>

          {published && (
            <Link
              className="secondary-button"
              to={`/u/${profile.username}`}
            >
              View public profile
            </Link>
          )}
        </section>

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

        <section className="onboarding-card profile-editor">
          <h2>Professional information</h2>

          {published && (
            <p className="profile-help">
              This profile is published and read-only.
              Unpublish it before making changes.
            </p>
          )}

          <form className="auth-form" onSubmit={handleSave}>
            <div className="form-field">
              <label htmlFor="edit-headline">
                Professional headline
              </label>

              <input
                id="edit-headline"
                value={form.headline}
                maxLength={160}
                disabled={published || busy}
                onChange={(event) =>
                  updateField('headline', event.target.value)
                }
                placeholder="Full-stack Developer | SaaS Specialist"
              />
            </div>

            <div className="form-field">
              <label htmlFor="edit-bio">
                Professional biography
              </label>

              <textarea
                id="edit-bio"
                value={form.bio}
                maxLength={5000}
                rows={7}
                disabled={published || busy}
                onChange={(event) =>
                  updateField('bio', event.target.value)
                }
                placeholder="Describe your experience and services."
              />

              <small>{form.bio.length}/5000 characters</small>
            </div>

            <div className="onboarding-two-columns">
              <div className="form-field">
                <label htmlFor="edit-country">
                  Country code
                </label>

                <input
                  id="edit-country"
                  value={form.countryCode}
                  maxLength={2}
                  placeholder="AE"
                  disabled={published || busy}
                  onChange={(event) =>
                    updateField(
                      'countryCode',
                      event.target.value.toUpperCase(),
                    )
                  }
                />
              </div>

              <div className="form-field">
                <label htmlFor="edit-city">
                  City
                </label>

                <input
                  id="edit-city"
                  value={form.city}
                  maxLength={100}
                  placeholder="Dubai"
                  disabled={published || busy}
                  onChange={(event) =>
                    updateField('city', event.target.value)
                  }
                />
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="edit-website">
                Professional website
              </label>

              <input
                id="edit-website"
                type="url"
                value={form.websiteUrl}
                maxLength={2048}
                placeholder="https://example.com"
                disabled={published || busy}
                onChange={(event) =>
                  updateField('websiteUrl', event.target.value)
                }
              />
            </div>

            {!published && (
              <div className="onboarding-actions">
                <button
                  type="submit"
                  className="secondary-button"
                  disabled={busy || !hasChanges}
                >
                  {action === 'saving'
                    ? 'Saving…'
                    : 'Save changes'}
                </button>

                {!completed && (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void handleComplete()}
                    disabled={busy || hasChanges}
                  >
                    {action === 'validating'
                      ? 'Validating…'
                      : 'Complete profile'}
                  </button>
                )}
              </div>
            )}

            {hasChanges && !published && (
              <p className="profile-help">
                You have unsaved changes. Save them before
                completing or publishing your profile.
              </p>
            )}
          </form>
        </section>

        <section className="onboarding-card profile-publication-panel">
          <h2>Profile visibility</h2>

          {published ? (
            <>
              <p>
                Your profile is public. Anyone with your
                profile URL can view the information you published.
              </p>

              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => setConfirmation('unpublish')}
              >
                Unpublish profile
              </button>
            </>
          ) : (
            <>
              <p>
                Your profile is currently private.
                Complete validation before making it public.
              </p>

              <button
                type="button"
                className="primary-button"
                disabled={busy || !readyToPublish}
                onClick={() => setConfirmation('publish')}
              >
                Publish profile
              </button>
            </>
          )}

          {confirmation && (
            <div
              className="profile-confirmation"
              aria-label="Confirm visibility change"
            >
              <h3>
                {confirmation === 'publish'
                  ? 'Publish your profile?'
                  : 'Make your profile private?'}
              </h3>

              <p>
                {confirmation === 'publish'
                  ? 'Your professional details will become publicly accessible through your profile URL.'
                  : 'Your public profile will become unavailable. Copies already saved elsewhere may still exist.'}
              </p>

              <div className="onboarding-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void handleVisibilityChange()}
                >
                  {action === 'publishing'
                    ? 'Publishing…'
                    : action === 'unpublishing'
                      ? 'Unpublishing…'
                      : confirmation === 'publish'
                        ? 'Confirm publish'
                        : 'Confirm unpublish'}
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setConfirmation(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="onboarding-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => void reloadProfile()}
          >
            Reload from server
          </button>

          <Link className="secondary-button" to="/dashboard">
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
