import type {
  PublicPortfolioProject,
  PublicPortfolioSkill,
} from './profile.types';

interface Props {
  projects: PublicPortfolioProject[];
  skills: PublicPortfolioSkill[];
}

function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);

    if (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.hostname &&
      !url.username &&
      !url.password
    ) {
      return url.toString();
    }
  } catch {
    // Invalid external links are not rendered.
  }

  return null;
}

function formatProjectDate(value: string | null): string | null {
  return value?.slice(0, 10) ?? null;
}

function ProjectCard({
  project,
}: {
  project: PublicPortfolioProject;
}) {
  const projectUrl = safeExternalUrl(project.projectUrl);
  const sourceUrl = safeExternalUrl(project.sourceUrl);

  const started = formatProjectDate(project.startedOn);
  const ended = formatProjectDate(project.endedOn);

  const dateLabel = [started, ended]
    .filter(Boolean)
    .join(' – ');

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

      {project.description && (
        <p className="public-profile-bio">
          {project.description}
        </p>
      )}

      {project.technologies.length > 0 && (
        <div className="portfolio-chip-row" aria-label="Technologies">
          {project.technologies.map((technology) => (
            <span className="portfolio-chip" key={technology}>
              {technology}
            </span>
          ))}
        </div>
      )}

      {(projectUrl || sourceUrl) && (
        <div className="onboarding-actions">
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
      )}
    </article>
  );
}

export function PublicPortfolioSections({
  projects,
  skills,
}: Props) {
  if (projects.length === 0 && skills.length === 0) {
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
              <li className="portfolio-chip" key={skill.name}>
                {skill.name}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
