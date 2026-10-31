import { useState } from 'react';
import type { FormEvent } from 'react';

import type {
  CreateProjectInput,
  PortfolioProject,
  ProjectVisibility,
} from './portfolio.types';

interface Props {
  project: PortfolioProject | null;
  busy: boolean;
  onSave: (input: CreateProjectInput) => Promise<boolean>;
  onCancel: () => void;
}

interface FormData {
  slug: string;
  title: string;
  summary: string;
  description: string;
  role: string;
  projectUrl: string;
  sourceUrl: string;
  technologies: string;
  startedOn: string;
  endedOn: string;
  visibility: ProjectVisibility;
  isFeatured: boolean;
}

function initialForm(project: PortfolioProject | null): FormData {
  return {
    slug: project?.slug ?? '',
    title: project?.title ?? '',
    summary: project?.summary ?? '',
    description: project?.description ?? '',
    role: project?.role ?? '',
    projectUrl: project?.projectUrl ?? '',
    sourceUrl: project?.sourceUrl ?? '',
    technologies: project?.technologies.join(', ') ?? '',
    startedOn: project?.startedOn?.slice(0, 10) ?? '',
    endedOn: project?.endedOn?.slice(0, 10) ?? '',
    visibility: project?.visibility ?? 'PRIVATE',
    isFeatured: project?.isFeatured ?? false,
  };
}

export function ProjectEditor({
  project,
  busy,
  onSave,
  onCancel,
}: Props) {
  const [form, setForm] = useState<FormData>(() => initialForm(project));
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormData>(
    field: K,
    value: FormData[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const slug = form.slug.trim().toLowerCase();
    const title = form.title.trim();

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
        slug.length < 3 || slug.length > 80) {
      setError('Use a 3–80 character slug with letters, numbers and hyphens.');
      return;
    }

    if (title.length < 3 || title.length > 160) {
      setError('Project title must contain 3–160 characters.');
      return;
    }

    const technologies = form.technologies
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (
      technologies.length > 25 ||
      technologies.some((value) => value.length > 60) ||
      new Set(technologies.map((value) => value.toLowerCase())).size
        !== technologies.length
    ) {
      setError('Use up to 25 unique technologies, each at most 60 characters.');
      return;
    }

    if (
      form.startedOn &&
      form.endedOn &&
      form.endedOn < form.startedOn
    ) {
      setError('The end date cannot precede the start date.');
      return;
    }

    const optional = (value: string) => value.trim() || null;

    const input: CreateProjectInput = {
      slug,
      title,
      summary: optional(form.summary),
      description: optional(form.description),
      role: optional(form.role),
      projectUrl: optional(form.projectUrl),
      sourceUrl: optional(form.sourceUrl),
      technologies,
      startedOn: form.startedOn || null,
      endedOn: form.endedOn || null,
      visibility: form.visibility,
      isFeatured: form.isFeatured,
    };

    await onSave(input);
  }

  return (
    <section className="onboarding-card portfolio-section">
      <h2>{project ? 'Edit project' : 'Create project'}</h2>

      <p className="profile-help">
        Changes are saved to your private portfolio workspace.
        Setting a project to public does not publish your freelancer profile.
      </p>

      {error && (
        <div className="form-alert form-alert--error" role="alert">
          {error}
        </div>
      )}

      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="onboarding-two-columns">
          <div className="form-field">
            <label htmlFor="project-title">Project title</label>
            <input
              id="project-title"
              required
              minLength={3}
              maxLength={160}
              disabled={busy}
              value={form.title}
              onChange={(event) => update('title', event.target.value)}
              placeholder="Research Dashboard"
            />
          </div>

          <div className="form-field">
            <label htmlFor="project-slug">Project slug</label>
            <input
              id="project-slug"
              required
              minLength={3}
              maxLength={80}
              disabled={busy}
              value={form.slug}
              onChange={(event) => update('slug', event.target.value)}
              placeholder="research-dashboard"
              spellCheck={false}
            />
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="project-summary">Short summary</label>
          <input
            id="project-summary"
            maxLength={500}
            disabled={busy}
            value={form.summary}
            onChange={(event) => update('summary', event.target.value)}
            placeholder="A brief introduction to the project"
          />
        </div>

        <div className="form-field">
          <label htmlFor="project-description">Full description</label>
          <textarea
            id="project-description"
            rows={5}
            maxLength={10000}
            disabled={busy}
            value={form.description}
            onChange={(event) => update('description', event.target.value)}
            placeholder="Explain the problem, your solution, and the results."
          />
        </div>

        <div className="form-field">
          <label htmlFor="project-role">Your role</label>
          <input
            id="project-role"
            maxLength={120}
            disabled={busy}
            value={form.role}
            onChange={(event) => update('role', event.target.value)}
            placeholder="Lead Developer"
          />
        </div>

        <div className="form-field">
          <label htmlFor="project-technologies">Technologies</label>
          <input
            id="project-technologies"
            disabled={busy}
            value={form.technologies}
            onChange={(event) => update('technologies', event.target.value)}
            placeholder="React, TypeScript, PostgreSQL"
          />
          <small>Separate technologies with commas; maximum 25.</small>
        </div>

        <div className="onboarding-two-columns">
          <div className="form-field">
            <label htmlFor="project-url">Project URL</label>
            <input
              id="project-url"
              type="url"
              maxLength={2048}
              disabled={busy}
              value={form.projectUrl}
              onChange={(event) => update('projectUrl', event.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <div className="form-field">
            <label htmlFor="project-source">Source code URL</label>
            <input
              id="project-source"
              type="url"
              maxLength={2048}
              disabled={busy}
              value={form.sourceUrl}
              onChange={(event) => update('sourceUrl', event.target.value)}
              placeholder="https://github.com/..."
            />
          </div>
        </div>

        <div className="onboarding-two-columns">
          <div className="form-field">
            <label htmlFor="project-start">Start date</label>
            <input
              id="project-start"
              type="date"
              disabled={busy}
              value={form.startedOn}
              onChange={(event) => update('startedOn', event.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="project-end">End date</label>
            <input
              id="project-end"
              type="date"
              disabled={busy}
              value={form.endedOn}
              onChange={(event) => update('endedOn', event.target.value)}
            />
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="project-visibility">Project visibility</label>
          <select
            id="project-visibility"
            disabled={busy}
            value={form.visibility}
            onChange={(event) =>
              update('visibility', event.target.value as ProjectVisibility)
            }
          >
            <option value="PRIVATE">Private</option>
            <option value="PUBLIC">Public when profile is published</option>
          </select>
        </div>

        <label className="portfolio-checkbox">
          <input
            type="checkbox"
            checked={form.isFeatured}
            disabled={busy}
            onChange={(event) =>
              update('isFeatured', event.target.checked)
            }
          />
          Feature this project
        </label>

        <div className="onboarding-actions">
          <button
            type="submit"
            className="primary-button"
            disabled={busy}
          >
            {busy ? 'Saving…' : project ? 'Save project' : 'Create project'}
          </button>

          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
