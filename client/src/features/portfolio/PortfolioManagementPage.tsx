import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { portfolioApi } from './portfolio.api';
import { profileApi } from '../profile/profile.api';

import { ProjectEditor } from './ProjectEditor';
import { ProjectList } from './ProjectList';
import { SkillManager } from './SkillManager';

import type { FreelancerProfile } from '../onboarding/onboarding.types';
import type {
  CreateProjectInput,
  PortfolioProject,
  PortfolioSkill,
} from './portfolio.types';

function getError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Unable to complete this operation.';
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
    useState<PortfolioProject | null | undefined>(undefined);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    if (busy) return;

    setLoading(true);
    setError(null);
    setNotice(null);
    setEditing(undefined);

    try {
      await fetchPortfolio();
    } catch (err) {
      setError(getError(err));
    } finally {
      setLoading(false);
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

    try {
      await action();

      // Refresh all data from the authoritative backend.
      await fetchPortfolio();

      setNotice(successMessage);
      return true;
    } catch (err) {
      setError(getError(err));
      return false;
    } finally {
      setBusy(false);
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
          <div role="alert" className="form-alert form-alert--error">
            {error}
          </div>
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

          <ProjectList
            projects={projects}
            canEdit={canEdit}
            busy={busy}
            onEdit={(project) => {
              setEditing(project);
              setError(null);
            }}
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
            onCancel={() => setEditing(undefined)}
          />
        )}

          <SkillManager
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
            Refresh portfolio
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
