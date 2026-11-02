import { Link } from 'react-router-dom';

import type {
  PublicPortfolioProject,
  PublicPortfolioSkill,
} from './profile.types';

interface Props {
  username: string;
  projects: PublicPortfolioProject[];
  skills: PublicPortfolioSkill[];
}

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
    // Invalid links are never rendered.
  }

  return null;
}

function ProjectCard({
  project,
  username,
}: {
  project: PublicPortfolioProject;
  username: string;
}) {
  const projectUrl = safeExternalUrl(project.projectUrl);
  const sourceUrl = safeExternalUrl(project.sourceUrl);

  const dateLabel = [
    project.startedOn?.slice(0, 10),
    project.endedOn?.slice(0, 10),
  ].filter(Boolean).join(' – ');

  const detailPath =
    `/u/${encodeURIComponent(username)}` +
    `/projects/${encodeURIComponent(project.slug)}`;

  return (
    <article className="public-portfolio-project">
      <div className="public-portfolio-project-heading">
        <h3>{project.title}</h3>

        {project.isFeatured && (
          <span className="portfolio-chip">
            Featured
          </span>
        )}
      </div>

      {project.summary && (
        <p className="public-portfolio-summary">
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
        <div
          className="portfolio-chip-row"
          aria-label="Project tags"
        >
          {project.technologies.map((technology) => (
            <span
              className="portfolio-chip"
              key={technology}
            >
              {technology}
            </span>
          ))}
        </div>
      )}

      <div className="onboarding-actions">
        <Link
          className="primary-button"
          to={detailPath}
        >
          View full case study
        </Link>

        {projectUrl && (
          <a
            href={projectUrl}
            className="secondary-button"
            target="_blank"
            rel="noopener noreferrer"
          >
            View project
          </a>
        )}

        {sourceUrl && (
          <a
            href={sourceUrl}
            className="secondary-button"
            target="_blank"
            rel="noopener noreferrer"
          >
            View source code
          </a>
        )}
      </div>
    </article>
  );
}

export function PublicPortfolioSections({
  username,
  projects,
  skills,
}: Props) {
  if (
    projects.length === 0 &&
    skills.length === 0
  ) {
    return null;
  }

  return (
    <>
      {projects.length > 0 && (
        <section className="public-profile-section">
          <h2>Portfolio projects</h2>

          <div className="public-portfolio-projects">
            {projects.map((project) => (
              <ProjectCard
                key={project.slug}
                project={project}
                username={username}
              />
            ))}
          </div>
        </section>
      )}

      {skills.length > 0 && (
        <section className="public-profile-section">
          <h2>Professional skills</h2>

          <ul className="public-portfolio-skills">
            {skills.map((skill) => (
              <li
                key={skill.name}
                className="portfolio-chip"
              >
                {skill.name}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
