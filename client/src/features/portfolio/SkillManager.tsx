import { useState } from 'react';
import type { FormEvent } from 'react';

import type { PortfolioSkill } from './portfolio.types';

interface Props {
  skills: PortfolioSkill[];
  canEdit: boolean;
  busy: boolean;
  onAdd: (name: string) => Promise<boolean>;
  onRename: (id: string, name: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onReorder: (ids: string[]) => Promise<boolean>;
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = name.trim();
    if (!trimmed || busy || !canEdit) return;

    if (await onAdd(trimmed)) {
      setName('');
    }
  }

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = editName.trim();
    if (!editingId || !trimmed || busy || !canEdit) return;

    if (await onRename(editingId, trimmed)) {
      setEditingId(null);
      setEditName('');
    }
  }

  async function remove(id: string) {
    if (await onDelete(id)) {
      setDeletingId(null);
    }
  }

  function move(index: number, direction: -1 | 1) {
    if (busy || !canEdit) return;

    const target = index + direction;

    if (target < 0 || target >= skills.length) return;

    const ids = skills.map((skill) => skill.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];

    void onReorder(ids);
  }

  return (
    <section className="onboarding-card portfolio-section">
      <h2>Professional skills</h2>

      <p className="profile-help">
        Showcase the expertise you want clients to recognize.
        You can add up to 100 skills.
      </p>

      {canEdit && (
        <form className="portfolio-add-skill" onSubmit={(event) => void add(event)}>
          <div className="form-field">
            <label htmlFor="new-skill">Skill name</label>
            <input
              id="new-skill"
              value={name}
              maxLength={80}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              placeholder="React, C++, Molecular Biology..."
              required
            />
          </div>

          <button
            type="submit"
            className="primary-button"
            disabled={busy || !name.trim() || skills.length >= 100}
          >
            Add skill
          </button>
        </form>
      )}

      {skills.length === 0 ? (
        <p className="profile-help">No skills added yet.</p>
      ) : (
        <ul className="portfolio-skill-list">
          {skills.map((skill, index) => (
            <li key={skill.id} className="portfolio-skill-item">
              {editingId === skill.id && canEdit ? (
                <form
                  className="portfolio-skill-edit"
                  onSubmit={(event) => void rename(event)}
                >
                  <div className="form-field">
                    <label htmlFor={`skill-edit-${skill.id}`}>
                      Rename skill {skill.name}
                    </label>
                    <input
                      id={`skill-edit-${skill.id}`}
                      maxLength={80}
                      value={editName}
                      disabled={busy}
                      onChange={(event) => setEditName(event.target.value)}
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
                    onClick={() => setEditingId(null)}
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
                          setEditName(skill.name);
                          setDeletingId(null);
                        }}
                      >
                        Rename {skill.name}
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy || index === 0}
                        aria-label={`Move ${skill.name} up`}
                        onClick={() => move(index, -1)}
                      >
                        Up
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy || index === skills.length - 1}
                        aria-label={`Move ${skill.name} down`}
                        onClick={() => move(index, 1)}
                      >
                        Down
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => setDeletingId(skill.id)}
                      >
                        Remove {skill.name}
                      </button>
                    </div>
                  )}
                </>
              )}

              {canEdit && deletingId === skill.id && (
                <div className="profile-confirmation">
                  <p>Remove {skill.name} from your skills?</p>

                  <div className="onboarding-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busy}
                      onClick={() => void remove(skill.id)}
                    >
                      Confirm remove {skill.name}
                    </button>

                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => setDeletingId(null)}
                    >
                      Cancel removal
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
