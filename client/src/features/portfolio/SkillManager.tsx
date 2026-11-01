import { useState } from 'react';
import type { FormEvent } from 'react';
import { SortablePortfolioList } from './SortablePortfolioList';

import type {
  PortfolioSkill,
  VersionedRecord,
} from './portfolio.types';

interface Props {
  skills: PortfolioSkill[];
  canEdit: boolean;
  busy: boolean;

  onAdd: (name: string) => Promise<boolean>;

  onRename: (
    id: string,
    name: string,
    version: number,
  ) => Promise<boolean>;

  onDelete: (
    id: string,
    version: number,
  ) => Promise<boolean>;

  onReorder: (
    items: VersionedRecord[],
  ) => Promise<boolean>;
}

export function SkillManager({
  skills,
  canEdit,
  busy,
  onAdd,
  onRename,
  onDelete,
  onReorder,
}: Props) {
  const [name, setName] = useState('');

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [editingVersion, setEditingVersion] =
    useState<number | null>(null);

  const [editName, setEditName] = useState('');

  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const [deletingVersion, setDeletingVersion] =
    useState<number | null>(null);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = name.trim();

    if (!trimmed || busy || !canEdit) {
      return;
    }

    if (await onAdd(trimmed)) {
      setName('');
    }
  }

  async function rename(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const trimmed = editName.trim();

    if (
      !editingId ||
      editingVersion === null ||
      !trimmed ||
      busy ||
      !canEdit
    ) {
      return;
    }

    const saved = await onRename(
      editingId,
      trimmed,
      editingVersion,
    );

    if (saved) {
      setEditingId(null);
      setEditingVersion(null);
      setEditName('');
    }
  }

  async function remove() {
    if (
      !deletingId ||
      deletingVersion === null ||
      busy ||
      !canEdit
    ) {
      return;
    }

    const removed = await onDelete(
      deletingId,
      deletingVersion,
    );

    if (removed) {
      setDeletingId(null);
      setDeletingVersion(null);
    }
  }

  return (
    <section className="onboarding-card portfolio-section">
      <h2>Professional skills</h2>

      <p className="profile-help">
        Showcase the expertise you want clients to recognize.
        You can add up to 100 skills.
      </p>

      {canEdit && (
        <form
          className="portfolio-add-skill"
          onSubmit={(event) => void add(event)}
        >
          <div className="form-field">
            <label htmlFor="new-skill">
              Skill name
            </label>

            <input
              id="new-skill"
              value={name}
              maxLength={80}
              disabled={busy}
              onChange={(event) =>
                setName(event.target.value)
              }
              placeholder="Design, Writing, Photography..."
              required
            />
          </div>

          <button
            type="submit"
            className="primary-button"
            disabled={
              busy ||
              !name.trim() ||
              skills.length >= 100
            }
          >
            Add skill
          </button>
        </form>
      )}

      {skills.length === 0 ? (
        <p className="profile-help">
          No skills added yet.
        </p>
      ) : (
        <SortablePortfolioList
          items={skills}
          disabled={!canEdit || busy}
          showHandles={canEdit}
          label={(skill) => skill.name}
          onReorder={onReorder}
          renderItem={(skill) => (
            <div className="portfolio-skill-item">
              {editingId === skill.id && canEdit ? (
                <form
                  className="portfolio-skill-edit"
                  onSubmit={(event) => void rename(event)}
                >
                  <div className="form-field">
                    <label
                      htmlFor={`skill-edit-${skill.id}`}
                    >
                      Rename skill {skill.name}
                    </label>

                    <input
                      id={`skill-edit-${skill.id}`}
                      maxLength={80}
                      value={editName}
                      disabled={busy}
                      onChange={(event) =>
                        setEditName(event.target.value)
                      }
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={busy || !editName.trim()}
                  >
                    Save skill
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => {
                      setEditingId(null);
                      setEditingVersion(null);
                    }}
                  >
                    Cancel rename
                  </button>
                </form>
              ) : (
                <>
                  <strong>{skill.name}</strong>

                  {canEdit && (
                    <div className="portfolio-skill-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(skill.id);
                          setEditingVersion(skill.version);
                          setEditName(skill.name);
                          setDeletingId(null);
                          setDeletingVersion(null);
                        }}
                      >
                        Rename {skill.name}
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => {
                          setDeletingId(skill.id);
                          setDeletingVersion(skill.version);
                          setEditingId(null);
                          setEditingVersion(null);
                        }}
                      >
                        Remove {skill.name}
                      </button>
                    </div>
                  )}
                </>
              )}

              {canEdit && deletingId === skill.id && (
                <div className="profile-confirmation">
                  <p>
                    Remove {skill.name} from your skills?
                  </p>

                  <div className="onboarding-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busy}
                      onClick={() => void remove()}
                    >
                      Confirm remove {skill.name}
                    </button>

                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => {
                        setDeletingId(null);
                        setDeletingVersion(null);
                      }}
                    >
                      Cancel removal
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        />
      )}
    </section>
  );
}
