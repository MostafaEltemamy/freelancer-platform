import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../lib/api-client';
import { portfolioApi } from './portfolio.api';
import { profileApi } from '../profile/profile.api';
import { ProjectEditor } from './ProjectEditor';
import { ProjectList } from './ProjectList';
import { SkillManager } from './SkillManager';
import './portfolio-feedback.css';

import type { FreelancerProfile } from '../onboarding/onboarding.types';

import type {
  CreateProjectInput,
  PortfolioProject,
  PortfolioProjectDetail,
  PortfolioSkill,
} from './portfolio.types';


function getError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Unable to complete this operation.';
}

function isStaleVersionError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.code === 'STALE_VERSION'
  );
}

export function PortfolioManagementPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] =
    useState<FreelancerProfile | null>(null);
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [skills, setSkills] = useState<PortfolioSkill[]>([]);

  // undefined = editor closed; null = new project.
  const [editing, setEditing] =
    useState<PortfolioProjectDetail | null | undefined>(undefined);

  const [openingProjectId, setOpeningProjectId] =
    useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // True only when a mutation failed due to an outdated version.
  const [hasVersionConflict, setHasVersionConflict] =
    useState(false);

  // Reset the Skills Manager only after an intentional reload.
  const [skillEditorGeneration, setSkillEditorGeneration] =
    useState(0);

  async function fetchPortfolio() {
    const [profileResponse, projectsResponse, skillsResponse] =
      await Promise.all([
        profileApi.getMine(),
        portfolioApi.listProjects(),
        portfolioApi.listSkills(),
      ]);

    setProfile(profileResponse.profile);
    setProjects(projectsResponse.projects);
    setSkills(skillsResponse.skills);

    return profileResponse.profile;
  }

  useEffect(() => {
    let active = true;

    void Promise.all([
      profileApi.getMine(),
      portfolioApi.listProjects(),
      portfolioApi.listSkills(),
    ]).then(([profileResult, projectResult, skillResult]) => {
      if (!active) return;

      setProfile(profileResult.profile);
      setProjects(projectResult.projects);
      setSkills(skillResult.skills);
      setLoading(false);
    }).catch((err: unknown) => {
      if (!active) return;
      setError(getError(err));
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  async function reload() {
    if (busy || openingProjectId !== null) return;

    setBusy(true);

    try {
      // Fetch the latest authoritative data first.
      // Do not discard local editors before this succeeds.
      await fetchPortfolio();

      // The user explicitly chose to load the latest data.
      setEditing(undefined);

      // Clear any ongoing skill rename or delete confirmation.
      setSkillEditorGeneration((current) => current + 1);

      setHasVersionConflict(false);
      setError(null);
      setNotice(null);
    } catch (err) {
      // If refreshing fails, keep the existing form and inputs.
      setError(getError(err));
    } finally {
      setBusy(false);
    }
  }

  async function perform(
    action: () => Promise<unknown>,
    successMessage: string,
  ): Promise<boolean> {
    if (busy || profile?.status !== 'DRAFT') {
      return false;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    let mutationCompleted = false;

    try {
      await action();
      mutationCompleted = true;

      // Refresh only after the mutation succeeded.
      await fetchPortfolio();

      setHasVersionConflict(false);
      setNotice(successMessage);

      return true;
    } catch (err) {
      if (mutationCompleted) {
        // The write succeeded, but retrieving refreshed data failed.
        // Do not incorrectly tell the user their save failed.
        setError(
          'Your change was saved, but the latest portfolio ' +
          'could not be loaded. Refresh the portfolio before ' +
          'making further changes.',
        );

        setHasVersionConflict(false);
      } else {
        setError(getError(err));
        setHasVersionConflict(isStaleVersionError(err));
      }

      return false;
    } finally {
      setBusy(false);
    }
  }

  async function openProject(
    project: PortfolioProject,
  ): Promise<void> {
    if (busy || openingProjectId !== null) {
      return;
    }

    setOpeningProjectId(project.id);
    setError(null);
    setNotice(null);
    setHasVersionConflict(false);

    try {
      // Always load the complete authoritative record.
      // The list intentionally contains no custom JSON.
      const result = await portfolioApi.getProject(project.id);

      setEditing(result.project);
    } catch (err) {
      // Do not open an empty editor after a failed fetch.
      setError(getError(err));
    } finally {
      setOpeningProjectId(null);
    }
  }

  async function saveProject(
    input: CreateProjectInput,
  ): Promise<boolean> {
    const saved = await perform(
      () => editing
        ? portfolioApi.updateProject(
            editing.id,
            input,
            editing.version,
          )
        : portfolioApi.createProject(input),
      editing ? 'Project updated successfully.' : 'Project created successfully.',
    );

    if (saved) {
      setEditing(undefined);
    }

    return saved;
  }

  if (loading) {
    return (
      <main className="page-message" role="status">
        Loading your portfolio…
      </main>
    );
  }

  if (!profile?.username && !error) {
    return (
      <main className="page-message">
        <h1>Set up your freelancer profile</h1>
        <p>Reserve your username before managing portfolio content.</p>

        <Link className="primary-button" to="/onboarding">
          Start onboarding
        </Link>
      </main>
    );
  }

  if (error && !profile) {
    return (
      <main className="page-message">
        <h1>Unable to load your portfolio</h1>
        <p role="alert">{error}</p>

        <button
          type="button"
          className="primary-button"
          onClick={() => void reload()}
        >
          Try again
        </button>
      </main>
    );
  }

  const canEdit = profile?.status === 'DRAFT';

  return (
    <main className="onboarding-layout">
      <div className="onboarding-container portfolio-container">
        <header className="onboarding-header">
          <Link className="brand" to="/dashboard">
            Freelancer Platform
          </Link>

          <p className="eyebrow">Portfolio workspace</p>
          <h1>Manage your portfolio</h1>

          <p className="auth-description">
            Showcase your work, organize projects and maintain
            your professional skills.
          </p>
        </header>

        <section className="onboarding-card portfolio-section">
          <div className="portfolio-toolbar">
            <div>
              <h2>Portfolio status</h2>
              <p>
                {canEdit
                  ? 'Private draft — editing enabled'
                  : 'Published profile — read-only'}
              </p>
            </div>

            <Link className="secondary-button" to="/profile">
              Manage publication
            </Link>
          </div>

          {!canEdit && (
            <p className="profile-help">
              Unpublish your freelancer profile before
              editing projects or skills.
            </p>
          )}

          <p className="profile-help">
            Editing portfolio content requires profile validation
            again before your next publication.
          </p>
        </section>

        {error && (
          <div
            className="portfolio-feedback portfolio-feedback--error"
            role="alert"
          >
            <span
              className="portfolio-feedback-icon"
              aria-hidden="true"
            >
              !
            </span>

            <div className="portfolio-feedback-content">
              <strong>We couldn't complete that action</strong>
              <p>{error}</p>
            </div>

            <button
              type="button"
              className="portfolio-feedback-dismiss"
              aria-label="Dismiss error"
              onClick={() => setError(null)}
            >
              ×
            </button>
          </div>
        )}

        {hasVersionConflict && (
          <section
            className="onboarding-card portfolio-section"
            role="group"
            aria-label="Version conflict recovery"
          >
            <h2>Newer portfolio changes detected</h2>

            <p className="profile-help">
              Another browser tab or session has changed this record
              since you loaded it. Your outdated request was rejected,
              so the newer saved data has not been overwritten.
            </p>

            <p className="profile-help">
              Your current editor has not been cleared. You can keep
              your edits here for reference, or load the latest saved
              portfolio. Loading the latest version will discard any
              unsaved edits in this tab.
            </p>

            <div className="onboarding-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => void reload()}
              >
                Discard local edits and load latest
              </button>
            </div>
          </section>
        )}

        {notice && (
          <div role="status" className="form-alert form-alert--success">
            {notice}
          </div>
        )}

        <section className="onboarding-card portfolio-section">
          <div className="portfolio-toolbar">
            <div>
              <h2>Portfolio projects</h2>
              <p className="profile-help">
                {projects.length} of 100 projects
              </p>
            </div>

            {canEdit && editing === undefined && (
              <button
                type="button"
                className="primary-button"
                disabled={busy || projects.length >= 100}
                onClick={() => setEditing(null)}
              >
                Add project
              </button>
            )}
          </div>

          {openingProjectId !== null && (
            <p role="status" className="profile-help">
              Loading project details…
            </p>
          )}

          <ProjectList
            projects={projects}
            canEdit={canEdit}
            busy={busy || openingProjectId !== null}
            onEdit={(project) => {void openProject(project);}}
            onDelete={(id, version) =>
              perform(
                () => portfolioApi.deleteProject(id, version),
                'Project deleted successfully.',
              )
            }
            onReorder={(items) =>
              perform(
                () => portfolioApi.reorderProjects(items),
                'Project order updated.',
              )
            }
          />
        </section>

        {canEdit && editing !== undefined && (
          <ProjectEditor
            key={editing?.id ?? 'new-project'}
            project={editing}
            busy={busy}
            onSave={saveProject}
            onCancel={() => {
              setEditing(undefined);
              setHasVersionConflict(false);
              setError(null);
            }}
          />
        )}

          <SkillManager
            key={skillEditorGeneration}
            skills={skills}
            canEdit={canEdit}
            busy={busy}
            onAdd={(name) =>
              perform(
                () => portfolioApi.createSkill({ name }),
                'Skill added successfully.',
              )
            }
            onRename={(id, name, version) =>
              perform(
                () => portfolioApi.updateSkill(
                  id,
                  { name },
                  version,
                ),
                'Skill renamed successfully.',
              )
            }
            onDelete={(id, version) =>
              perform(
                () => portfolioApi.deleteSkill(id, version),
                'Skill removed successfully.',
              )
            }
            onReorder={(items) =>
              perform(
                () => portfolioApi.reorderSkills(items),
                'Skill order updated.',
              )
            }
          />

        <div className="onboarding-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => void reload()}
          >
            Refresh portfolio (discard unsaved edits)
          </button>

          <Link className="secondary-button" to="/portfolio">
            Manage portfolio projects and skills
          </Link>

          <Link className="secondary-button" to="/dashboard">
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
