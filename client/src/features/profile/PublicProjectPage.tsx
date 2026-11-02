import { useEffect, useState } from 'react';
import {
  Link,
  useParams,
} from 'react-router-dom';

import { ApiError } from '../../lib/api-client';
import { profileApi } from './profile.api';

import type {
  PublicProjectDetail,
  PublicProjectField,
} from './profile.types';

import './public-project-detail.css';

type PageStatus =
  | 'loading'
  | 'found'
  | 'missing'
  | 'error';

function safeExternalUrl(
  value: string | null,
): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);

    if (
      (url.protocol === 'https:' ||
        url.protocol === 'http:') &&
      url.hostname &&
      !url.username &&
      !url.password
    ) {
      return url.toString();
    }
  } catch {
    // Do not create unsafe links.
  }

  return null;
}

function hasPublicValue(field: PublicProjectField): boolean {
  if (field.value === null) return false;

  if (Array.isArray(field.value)) {
    return field.value.length > 0;
  }

  if (typeof field.value === 'string') {
    return field.value.trim().length > 0;
  }

  return true;
}

function PublicField({
  field,
}: {
  field: PublicProjectField;
}) {
  if (!hasPublicValue(field)) {
    return null;
  }

  if (field.type === 'LIST') {
    return (
      <div className="public-case-field">
        <dt>{field.label}</dt>
        <dd>
          <ul>
            {field.value.map((item, index) => (
              <li key={`${index}-${item}`}>
                {item}
              </li>
            ))}
          </ul>
        </dd>
      </div>
    );
  }

  if (field.type === 'URL') {
    const url = safeExternalUrl(field.value);

    if (!url) return null;

    return (
      <div className="public-case-field">
        <dt>{field.label}</dt>
        <dd>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open link
          </a>
        </dd>
      </div>
    );
  }

  let displayValue: string;

  if (field.type === 'BOOLEAN') {
    displayValue =
      field.value === true ? 'Yes' : 'No';
  } else if (field.type === 'NUMBER') {
    displayValue = field.value!.toLocaleString();
  } else {
    displayValue = String(field.value);
  }

  return (
    <div className="public-case-field">
      <dt>{field.label}</dt>
      <dd>{displayValue}</dd>
    </div>
  );
}

function PublicCaseStudy({
  project,
  username,
}: {
  project: PublicProjectDetail;
  username: string;
}) {
  const projectUrl =
    safeExternalUrl(project.projectUrl);

  const sourceUrl =
    safeExternalUrl(project.sourceUrl);

  const backPath =
    `/u/${encodeURIComponent(username)}`;

  const dateLabel = [
    project.startedOn?.slice(0, 10),
    project.endedOn?.slice(0, 10),
  ].filter(Boolean).join(' – ');

  return (
    <main className="public-profile-layout">
      <nav className="public-profile-nav">
        <Link
          className="secondary-button"
          to={backPath}
        >
          Back to freelancer profile
        </Link>
      </nav>

      <article className="public-profile-card public-case-study">
        <header>
          <p className="eyebrow">
            Professional project
          </p>

          {project.isFeatured && (
            <span className="portfolio-chip">
              Featured project
            </span>
          )}

          <h1>{project.title}</h1>

          {project.summary && (
            <p className="public-case-summary">
              {project.summary}
            </p>
          )}

          {project.role && (
            <p className="public-portfolio-meta">
              Role: {project.role}
            </p>
          )}

          {dateLabel && (
            <p className="public-portfolio-meta">
              {dateLabel}
            </p>
          )}

          {project.technologies.length > 0 && (
            <div className="portfolio-chip-row">
              {project.technologies.map((item) => (
                <span
                  key={item}
                  className="portfolio-chip"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </header>

        {project.description && (
          <section className="public-profile-section">
            <h2>Project overview</h2>

            <p className="public-profile-bio">
              {project.description}
            </p>
          </section>
        )}

        {project.content.sections.map(
          (section, index) => {
            const visibleFields = section.fields.filter(
              hasPublicValue,
            );

            return (
              <section
                className="public-profile-section"
                key={`${index}-${section.title}`}
              >
                <h2>{section.title}</h2>

                {section.description && (
                  <p className="public-profile-bio">
                    {section.description}
                  </p>
                )}

                {visibleFields.length > 0 && (
                  <dl className="public-case-fields">
                    {visibleFields.map((field, fieldIndex) => (
                      <PublicField
                        key={`${fieldIndex}-${field.label}`}
                        field={field}
                      />
                    ))}
                  </dl>
                )}
              </section>
            );
          },
        )}

        {(projectUrl || sourceUrl) && (
          <section className="public-profile-section">
            <h2>Project links</h2>

            <div className="onboarding-actions">
              {projectUrl && (
                <a
                  className="primary-button"
                  href={projectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open project website
                </a>
              )}

              {sourceUrl && (
                <a
                  className="secondary-button"
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View source code
                </a>
              )}
            </div>
          </section>
        )}
      </article>
    </main>
  );
}

function PublicProjectContent({
  username,
  slug,
}: {
  username: string;
  slug: string;
}) {
  const [status, setStatus] =
    useState<PageStatus>('loading');

  const [project, setProject] =
    useState<PublicProjectDetail | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    void profileApi.getPublicProject(username, slug)
      .then((response) => {
        if (!active) return;

        setProject(response.project);
        setStatus('found');
      })
      .catch((err: unknown) => {
        if (!active) return;

        if (
          err instanceof ApiError &&
          err.status === 404
        ) {
          setStatus('missing');
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load this project.',
        );

        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [username, slug, attempt]);

  if (status === 'loading') {
    return (
      <main className="page-message" role="status">
        Loading project…
      </main>
    );
  }

  if (status === 'missing') {
    return (
      <main className="page-message">
        <h1>Project unavailable</h1>

        <p>
          This project does not exist or is not public.
        </p>

        <Link
          className="secondary-button"
          to={`/u/${encodeURIComponent(username)}`}
        >
          Back to freelancer profile
        </Link>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="page-message">
        <h1>Unable to load project</h1>

        <p role="alert">
          {error ?? 'Please check your connection.'}
        </p>

        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setError(null);
            setStatus('loading');
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </button>
      </main>
    );
  }

  if (!project) return null;

  return (
    <PublicCaseStudy
      project={project}
      username={username}
    />
  );
}

export function PublicProjectPage() {
  const {
    username = '',
    slug = '',
  } = useParams<{
    username: string;
    slug: string;
  }>();

  return (
    <PublicProjectContent
      key={`${username}/${slug}`}
      username={username}
      slug={slug}
    />
  );
}
