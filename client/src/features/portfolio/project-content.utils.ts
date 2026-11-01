import type {
  ProjectContent,
  ProjectContentField,
} from './portfolio.types';

/**
 * Convert a field to its exact API representation.
 *
 * UI-only properties, such as drag-and-drop metadata,
 * must never be stored in project content.
 */
export function cleanProjectField(
  field: ProjectContentField,
): ProjectContentField {
  const { id, label } = field;

  switch (field.type) {
    case 'SHORT_TEXT':
    case 'LONG_TEXT':
    case 'URL':
    case 'DATE':
      return {
        id,
        label,
        type: field.type,
        value: field.value,
      };

    case 'NUMBER':
      return {
        id,
        label,
        type: field.type,
        value: field.value,
      };

    case 'BOOLEAN':
      return {
        id,
        label,
        type: field.type,
        value: field.value,
      };

    case 'LIST':
      return {
        id,
        label,
        type: field.type,
        value: [...field.value],
      };
  }
}

/**
 * Build a clean project content document.
 *
 * Preserve:
 * - Section and field IDs
 * - User-defined order
 * - Field names, types and values
 *
 * Remove:
 * - Drag-and-drop versions
 * - Temporary UI-only properties
 */
export function cleanProjectContent(
  content: ProjectContent,
): ProjectContent {
  return {
    schemaVersion: 1,

    sections: content.sections.map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description,

      fields: section.fields.map(cleanProjectField),
    })),
  };
}
