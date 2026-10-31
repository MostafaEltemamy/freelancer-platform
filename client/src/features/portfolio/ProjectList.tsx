import { useState } from 'react';

import type { PortfolioProject } from './portfolio.types';

interface Props {
  projects: PortfolioProject[];
  canEdit: boolean;
  busy: boolean;
  onEdit: (project: PortfolioProject) => void;
  onDelete: (id: string) => Promise<boolean>;
  onReorder: (ids: string[]) => Promise<boolean>;
}

export function ProjectList({
  projects,
  canEdit,
  busy,
  onEdit,
  onDelete,
  onReorder,
}: Props) {
  const [confirmDeleteId, setConfirmDeleteId] =
    useState<string | null>(null);

  function move(index: number, direction: -1 | 1) {
    if (!canEdit || busy) return;

    const target = index + direction;

    if (target < 0 || target >= projects.length) return;

    const ids = projects.map((project) => project.id);

    [ids[index], ids[target]] = [ids[target]!, ids[index]!];

    void onReorder(ids);
  }

  async function remove(id: string) {
    const success = await onDelete(id);

    if (success) {
      setConfirmDeleteId(null);
    }
  }

  if (projects.length === 0) {
    return (
      <p className="profile-help">
        No projects yet. Add your first project to start your portfolio.
      </p>
    );
  }

  return (
    <div className="portfolio-project-list">
      {projects.map((project, index) => (
        <article className="portfolio-project-item" key={project.id}>
          <div className="portfolio-project-top">
            <div>
              <h3>{project.title}</h3>
              <p className="portfolio-project-slug">
                {project.slug}
              </p>
            </div>

            <div className="portfolio-chip-row">
              <span className="portfolio-chip">
                {project.visibility === 'PUBLIC'
                  ? 'Public project'
                  : 'Private project'}
              </span>

              {project.isFeatured && (
                <span className="portfolio-chip">Featured</span>
              )}
            </div>
          </div>

          {project.summary && <p>{project.summary}</p>}
          {project.role && <p>Your role: {project.role}</p>}

          {project.technologies.length > 0 && (
            <div className="portfolio-chip-row">
              {project.technologies.map((technology) => (
                <span className="portfolio-chip" key={technology}>
                  {technology}
                </span>
              ))}
            </div>
          )}

          {canEdit && (
            <div className="onboarding-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => onEdit(project)}
              >
                Edit {project.title}
              </button>

              <button
                type="button"
                className="secondary-button"
                disabled={busy || index === 0}
                onClick={() => move(index, -1)}
                aria-label={`Move ${project.title} up`}
              >
                Move up
              </button>

              <button
                type="button"
                className="secondary-button"
                disabled={busy || index === projects.length - 1}
                onClick={() => move(index, 1)}
                aria-label={`Move ${project.title} down`}
              >
                Move down
              </button>

              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => setConfirmDeleteId(project.id)}
              >
                Delete {project.title}
              </button>
            </div>
          )}

          {canEdit && confirmDeleteId === project.id && (
            <div className="profile-confirmation">
              <h4>Delete this project?</h4>
              <p>This action cannot be undone.</p>

              <div className="onboarding-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void remove(project.id)}
                >
                  Confirm delete {project.title}
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setConfirmDeleteId(null)}
                >
                  Cancel deletion
                </button>
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
