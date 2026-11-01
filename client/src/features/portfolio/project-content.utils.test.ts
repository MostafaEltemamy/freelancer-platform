import { expect, test } from 'vitest';
import { cleanProjectContent } from './project-content.utils';

import type {
  ProjectContent,
} from './portfolio.types';

test('removes temporary version metadata from custom fields', () => {
  // Simulate the field object created by drag-and-drop.
  const fieldWithDragMetadata = {
    id: '11111111-1111-4111-8111-111111111111',
    label: 'Client',
    type: 'SHORT_TEXT' as const,
    value: 'Café Luna',
    version: 1,
  };

  const content: ProjectContent = {
    schemaVersion: 1,
    sections: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Overview',
        description: null,
        fields: [fieldWithDragMetadata],
      },
    ],
  };

  const cleaned = cleanProjectContent(content);

  expect(cleaned.sections[0]?.fields[0]).toEqual({
    id: fieldWithDragMetadata.id,
    label: 'Client',
    type: 'SHORT_TEXT',
    value: 'Café Luna',
  });

  expect(
    cleaned.sections[0]?.fields[0],
  ).not.toHaveProperty('version');

  expect(fieldWithDragMetadata.version).toBe(1);
});

test('preserves section order and list values', () => {
  const content: ProjectContent = {
    schemaVersion: 1,
    sections: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Deliverables',
        description: null,
        fields: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            label: 'Items',
            type: 'LIST',
            value: ['Logo', 'Packaging'],
          },
        ],
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        title: 'Results',
        description: null,
        fields: [],
      },
    ],
  };

  const cleaned = cleanProjectContent(content);

  expect(
    cleaned.sections.map((section) => section.title),
  ).toEqual(['Deliverables', 'Results']);

  expect(
    cleaned.sections[0]?.fields[0]?.value,
  ).toEqual(['Logo', 'Packaging']);
});
