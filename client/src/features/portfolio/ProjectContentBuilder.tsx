import { useState } from 'react';
import { SortablePortfolioList } from './SortablePortfolioList';
import { cleanProjectField } from './project-content.utils';

import type {
  ProjectContent,
  ProjectContentField,
  ProjectContentSection,
  ProjectFieldType,
  VersionedRecord,
} from './portfolio.types';

import './project-content-builder.css';

interface Props {
  value: ProjectContent;
  disabled: boolean;
  onChange: (value: ProjectContent) => void;
}

const FIELD_TYPES: {
  value: ProjectFieldType;
  label: string;
}[] = [
  { value: 'SHORT_TEXT', label: 'Short text' },
  { value: 'LONG_TEXT', label: 'Long text' },
  { value: 'URL', label: 'Website / Link' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'DATE', label: 'Date' },
  { value: 'BOOLEAN', label: 'Yes / No' },
  { value: 'LIST', label: 'List of items' },
];

const MAX_SECTIONS = 12;
const MAX_FIELDS_PER_SECTION = 30;
const MAX_TOTAL_FIELDS = 100;

function newId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

function createField(
  type: ProjectFieldType,
  id = newId(),
  label = 'New field',
): ProjectContentField {
  switch (type) {
    case 'SHORT_TEXT':
    case 'LONG_TEXT':
    case 'URL':
    case 'DATE':
      return { id, label, type, value: null };

    case 'NUMBER':
      return { id, label, type, value: null };

    case 'BOOLEAN':
      return { id, label, type, value: null };

    case 'LIST':
      return { id, label, type, value: [] };
  }
}

function orderedItems<T extends { id: string }>(
  current: readonly T[],
  order: VersionedRecord[],
): T[] {
  const lookup = new Map(
    current.map((item) => [item.id, item]),
  );

  return order
    .map((item) => lookup.get(item.id))
    .filter((item): item is T => item !== undefined);
}

function ListValueInput({
  field,
  disabled,
  onChange,
}: {
  field: Extract<ProjectContentField, { type: 'LIST' }>;
  disabled: boolean;
  onChange: (field: ProjectContentField) => void;
}) {
  const [draft, setDraft] = useState(
    field.value.join('\n'),
  );

  return (
    <div className="form-field">
      <label htmlFor={`field-value-${field.id}`}>
        List items
      </label>

      <textarea
        id={`field-value-${field.id}`}
        value={draft}
        rows={4}
        disabled={disabled}
        placeholder="One item per line"
        onChange={(event) => {
          const next = event.target.value;

          setDraft(next);

          onChange({
            ...field,
            value: next
              .split(/\r?\n/)
              .map((item) => item.trim())
              .filter(Boolean),
          });
        }}
      />

      <small>One item per line. Maximum 40 items.</small>
    </div>
  );
}

function FieldValueInput({
  field,
  disabled,
  onChange,
}: {
  field: ProjectContentField;
  disabled: boolean;
  onChange: (field: ProjectContentField) => void;
}) {
  switch (field.type) {
    case 'SHORT_TEXT':
    case 'URL':
    case 'DATE':
      return (
        <div className="form-field">
          <label htmlFor={`field-value-${field.id}`}>
            Field value
          </label>

          <input
            id={`field-value-${field.id}`}
            type={
              field.type === 'URL'
                ? 'url'
                : field.type === 'DATE'
                  ? 'date'
                  : 'text'
            }
            maxLength={
              field.type === 'SHORT_TEXT'
                ? 500
                : field.type === 'URL'
                  ? 2048
                  : undefined
            }
            value={field.value ?? ''}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...field,
                value: event.target.value || null,
              })
            }
          />
        </div>
      );

    case 'LONG_TEXT':
      return (
        <div className="form-field">
          <label htmlFor={`field-value-${field.id}`}>
            Field value
          </label>

          <textarea
            id={`field-value-${field.id}`}
            value={field.value ?? ''}
            maxLength={10000}
            rows={4}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...field,
                value: event.target.value || null,
              })
            }
          />
        </div>
      );

    case 'NUMBER':
      return (
        <div className="form-field">
          <label htmlFor={`field-value-${field.id}`}>
            Numeric value
          </label>

          <input
            id={`field-value-${field.id}`}
            type="number"
            step="any"
            min={-1_000_000_000_000}
            max={1_000_000_000_000}
            value={field.value ?? ''}
            disabled={disabled}
            onChange={(event) => {
              const raw = event.target.value;

              onChange({
                ...field,
                value:
                  raw === ''
                    ? null
                    : Number(raw),
              });
            }}
          />
        </div>
      );

    case 'BOOLEAN':
      return (
        <div className="form-field">
          <label htmlFor={`field-value-${field.id}`}>
            Field value
          </label>

          <select
            id={`field-value-${field.id}`}
            disabled={disabled}
            value={
              field.value === null
                ? ''
                : String(field.value)
            }
            onChange={(event) =>
              onChange({
                ...field,
                value:
                  event.target.value === ''
                    ? null
                    : event.target.value === 'true',
              })
            }
          >
            <option value="">Not specified</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
      );

    case 'LIST':
      return (
        <ListValueInput
          key={field.id}
          field={field}
          disabled={disabled}
          onChange={onChange}
        />
      );
  }
}

function formatValue(field: ProjectContentField): string {
  if (field.value === null) {
    return 'Not specified';
  }

  if (Array.isArray(field.value)) {
    return field.value.join(', ') || 'No items';
  }

  if (typeof field.value === 'boolean') {
    return field.value ? 'Yes' : 'No';
  }

  return String(field.value);
}

export function ProjectContentBuilder({
  value,
  disabled,
  onChange,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    value.sections[0]?.id ?? null,
  );

  const [newFieldType, setNewFieldType] =
    useState<ProjectFieldType>('SHORT_TEXT');

  const selected = value.sections.find(
    (section) => section.id === selectedId,
  );

  const totalFields = value.sections.reduce(
    (count, section) => count + section.fields.length,
    0,
  );

  function replaceSections(
    sections: ProjectContentSection[],
  ) {
    onChange({
      schemaVersion: 1,
      sections,
    });
  }

  function updateSection(
    nextSection: ProjectContentSection,
  ) {
    replaceSections(
      value.sections.map((section) =>
        section.id === nextSection.id
          ? nextSection
          : section,
      ),
    );
  }

  function addSection() {
    if (disabled || value.sections.length >= MAX_SECTIONS) {
      return;
    }

    const section: ProjectContentSection = {
      id: newId(),
      title: 'New section',
      description: null,
      fields: [],
    };

    replaceSections([...value.sections, section]);
    setSelectedId(section.id);
  }

  function removeSection(id: string) {
    if (disabled) return;

    const remaining = value.sections.filter(
      (section) => section.id !== id,
    );

    replaceSections(remaining);

    if (selectedId === id) {
      setSelectedId(remaining[0]?.id ?? null);
    }
  }

  function addField() {
    if (
      !selected ||
      disabled ||
      selected.fields.length >= MAX_FIELDS_PER_SECTION ||
      totalFields >= MAX_TOTAL_FIELDS
    ) {
      return;
    }

    updateSection({
      ...selected,
      fields: [
        ...selected.fields,
        createField(newFieldType),
      ],
    });
  }

  function updateField(nextField: ProjectContentField) {
    if (!selected || disabled) {
      return;
    }

    updateSection({
      ...selected,

      fields: selected.fields.map((field) => {
        const updatedField =
          field.id === nextField.id
            ? nextField
            : field;

        // Remove temporary drag-and-drop metadata
        // before storing a field in editor state.
        return cleanProjectField(updatedField);
      }),
    });
  }

  function removeField(id: string) {
    if (!selected || disabled) return;

    updateSection({
      ...selected,
      fields: selected.fields.filter(
        (field) => field.id !== id,
      ),
    });
  }

  async function reorderSections(
    items: VersionedRecord[],
  ): Promise<boolean> {
    if (disabled) return false;

    replaceSections(orderedItems(value.sections, items));

    return true;
  }

  async function reorderFields(
    items: VersionedRecord[],
  ): Promise<boolean> {
    if (!selected || disabled) return false;

    updateSection({
      ...selected,
      fields: orderedItems(selected.fields, items),
    });

    return true;
  }

  return (
    <div className="project-content-builder">
      <div className="project-content-heading">
        <div>
          <h3>Custom project content</h3>
          <p className="profile-help">
            Organize your work with sections and fields
            that match your profession.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          disabled={
            disabled ||
            value.sections.length >= MAX_SECTIONS
          }
          onClick={addSection}
        >
          Add section
        </button>
      </div>

      <div className="project-content-layout">
        <aside
          className="project-content-sidebar"
          aria-label="Project sections"
        >
          <h4>Sections ({value.sections.length})</h4>

          {value.sections.length === 0 ? (
            <p className="profile-help">
              Add your first section to get started.
            </p>
          ) : (
            <SortablePortfolioList
              items={value.sections.map((section) => ({
                ...section,
                version: 1,
              }))}
              disabled={disabled}
              label={(section) => section.title}
              onReorder={reorderSections}
              renderItem={(section) => (
                <button
                  type="button"
                  disabled={disabled}
                  className={
                    section.id === selectedId
                      ? 'project-section-choice project-section-choice--active'
                      : 'project-section-choice'
                  }
                  onClick={() => setSelectedId(section.id)}
                >
                  {section.title || 'Untitled section'}
                </button>
              )}
            />
          )}
        </aside>

        <div className="project-content-main">
          {!selected ? (
            <p className="profile-help">
              Select or add a section to customize it.
            </p>
          ) : (
            <>
              <div className="project-content-section-header">
                <h4>Section details</h4>

                <button
                  type="button"
                  className="secondary-button"
                  disabled={disabled}
                  onClick={() => removeSection(selected.id)}
                >
                  Remove section
                </button>
              </div>

              <div className="form-field">
                <label htmlFor="custom-section-title">
                  Section title
                </label>

                <input
                  id="custom-section-title"
                  value={selected.title}
                  maxLength={100}
                  disabled={disabled}
                  onChange={(event) =>
                    updateSection({
                      ...selected,
                      title: event.target.value,
                    })
                  }
                />
              </div>

              <div className="form-field">
                <label htmlFor="custom-section-description">
                  Section description (optional)
                </label>

                <textarea
                  id="custom-section-description"
                  rows={2}
                  maxLength={500}
                  disabled={disabled}
                  value={selected.description ?? ''}
                  onChange={(event) =>
                    updateSection({
                      ...selected,
                      description: event.target.value || null,
                    })
                  }
                />
              </div>

              <div className="project-content-section-header">
                <div>
                  <h4>Fields ({selected.fields.length})</h4>
                  <p className="profile-help">
                    Drag fields by their handles to reorder.
                  </p>
                </div>
              </div>

              <SortablePortfolioList
                items={selected.fields.map((field) => ({
                  ...field,
                  version: 1,
                }))}
                disabled={disabled}
                label={(field) => field.label}
                onReorder={reorderFields}
                renderItem={(field) => (
                  <div className="project-custom-field">
                    <div className="project-content-section-header">
                      <strong>
                        {field.label || 'Untitled field'}
                      </strong>

                      <button
                        type="button"
                        className="secondary-button"
                        disabled={disabled}
                        onClick={() => removeField(field.id)}
                      >
                        Remove field
                      </button>
                    </div>

                    <div className="project-field-grid">
                      <div className="form-field">
                        <label htmlFor={`field-label-${field.id}`}>
                          Field name
                        </label>

                        <input
                          id={`field-label-${field.id}`}
                          maxLength={80}
                          disabled={disabled}
                          value={field.label}
                          onChange={(event) =>
                            updateField({
                              ...field,
                              label: event.target.value,
                            })
                          }
                        />
                      </div>

                      <div className="form-field">
                        <label htmlFor={`field-type-${field.id}`}>
                          Field type
                        </label>

                        <select
                          id={`field-type-${field.id}`}
                          value={field.type}
                          disabled={disabled}
                          onChange={(event) => {
                            const type =
                              event.target.value as ProjectFieldType;

                            updateField(
                              createField(
                                type,
                                field.id,
                                field.label,
                              ),
                            );
                          }}
                        >
                          {FIELD_TYPES.map((option) => (
                            <option
                              key={option.value}
                              value={option.value}
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <FieldValueInput
                      field={field}
                      disabled={disabled}
                      onChange={updateField}
                    />

                    <small className="profile-help">
                      Changing a field type clears its old value.
                    </small>
                  </div>
                )}
              />

              <div className="project-add-field">
                <div className="form-field">
                  <label htmlFor="new-field-type">
                    New field type
                  </label>

                  <select
                    id="new-field-type"
                    disabled={disabled}
                    value={newFieldType}
                    onChange={(event) =>
                      setNewFieldType(
                        event.target.value as ProjectFieldType,
                      )
                    }
                  >
                    {FIELD_TYPES.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    disabled ||
                    selected.fields.length >= MAX_FIELDS_PER_SECTION ||
                    totalFields >= MAX_TOTAL_FIELDS
                  }
                  onClick={addField}
                >
                  Add field
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <details className="project-content-preview">
        <summary>Preview custom content</summary>

        {value.sections.length === 0 ? (
          <p>No custom content yet.</p>
        ) : (
          value.sections.map((section) => (
            <section key={section.id}>
              <h4>{section.title}</h4>

              {section.description && (
                <p>{section.description}</p>
              )}

              <dl>
                {section.fields.map((field) => (
                  <div key={field.id}>
                    <dt>{field.label}</dt>
                    <dd>{formatValue(field)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))
        )}
      </details>

      <p className="profile-help">
        You can add up to 12 sections and 100 fields
        across the project. Changes are saved when you
        select Save project.
      </p>
    </div>
  );
}
