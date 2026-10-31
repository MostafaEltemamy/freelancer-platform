import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../../lib/api-client';
import { profileApi } from './profile.api';
import { PublicPortfolioSections } from './PublicPortfolioSections';

import type {
  PublicFreelancerProfile,
} from './profile.types';

type PageStatus = 'loading' | 'found' | 'missing' | 'error';

function safeWebsiteUrl(value: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);

    if (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password
    ) {
      return url.toString();
    }
  } catch {
    // Ignore invalid external URLs.
  }

  return null;
}

function PublicProfileContent({ username }: { username: string }) {
  const [status, setStatus] = useState<PageStatus>('loading');

  const [profile, setProfile] =
    useState<PublicFreelancerProfile | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    void profileApi.getPublic(username)
      .then((result) => {
        if (!active) return;

        setProfile(result.profile);
        setStatus('found');
      })
      .catch((err: unknown) => {
        if (!active) return;

        if (err instanceof ApiError && err.status === 404) {
          setStatus('missing');
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load this profile.',
        );

        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [username, attempt]);

  if (status === 'loading') {
    return (
      <main className="page-message" role="status">
        Loading freelancer profile…
      </main>
    );
  }

  if (status === 'missing') {
    return (
      <main className="page-message">
        <h1>Profile unavailable</h1>

        <p>
          This profile does not exist or is not currently public.
        </p>

        <Link to="/" className="secondary-button">
          Back to home
        </Link>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="page-message">
        <h1>Unable to load profile</h1>

        <p role="alert">
          {error ?? 'Please check your connection.'}
        </p>

        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setError(null);
            setStatus('loading');
            setAttempt((current) => current + 1);
          }}
        >
          Try again
        </button>
      </main>
    );
  }

  if (!profile) {
    return null;
  }

  const website = safeWebsiteUrl(profile.websiteUrl);

  const location = [
    profile.city,
    profile.countryCode,
  ].filter(Boolean).join(', ');

  return (
    <main className="public-profile-layout">
      <nav className="public-profile-nav">
        <Link to="/" className="brand">
          Freelancer Platform
        </Link>
      </nav>

      <article className="public-profile-card">
        <header>
          <p className="eyebrow">Freelancer profile</p>

          <p className="public-profile-username">
            @{profile.username}
          </p>

          <h1>{profile.headline ?? profile.username}</h1>

          {location && (
            <p className="public-profile-location">
              {location}
            </p>
          )}
        </header>

        /* Existing professional biography */
        {profile.bio && (
          <section className="public-profile-section">
            <h2>About</h2>
            <p className="public-profile-bio">
              {profile.bio}
            </p>
          </section>
        )}

        <PublicPortfolioSections
          projects={profile.projects}
          skills={profile.skills}
        />

        {website && (
          <section className="public-profile-section">
            <h2>Professional website</h2>

            <a
              className="secondary-button"
              href={website}
              target="_blank"
              rel="noopener noreferrer"
            >
              Visit website
            </a>
          </section>
        )}
      </article>
    </main>
  );
}

export function PublicProfilePage() {
  const { username = '' } = useParams<{ username: string }>();

  // A different username starts with fresh page state.
  return (
    <PublicProfileContent
      key={username}
      username={username}
    />
  );
}
