import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  emptyProjectContent,
  projectContentSchema,
} from '../src/modules/freelancer/project-content.schemas.js';

function field(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: randomUUID(),
    label: 'Client name',
    type: 'SHORT_TEXT',
    value: 'Café Luna',
    ...overrides,
  };
}

function section(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: randomUUID(),
    title: 'Project Overview',
    description: null,
    fields: [field()],
    ...overrides,
  };
}

function document(sections = [section()]) {
  return {
    schemaVersion: 1,
    sections,
  };
}

test('accepts an empty project content document', () => {
  const result = projectContentSchema.safeParse(
    emptyProjectContent(),
  );

  assert.equal(result.success, true);
});

test('accepts custom fields from different professions', () => {
  const input = document([
    section({
      title: 'Copywriting Project',
      fields: [
        field({
          label: 'Publication URL',
          type: 'URL',
          value: 'https://example.com/article',
        }),
        field({
          label: 'Word Count',
          type: 'NUMBER',
          value: 2500,
        }),
      ],
    }),
    section({
      title: 'Graphic Design Project',
      fields: [
        field({
          label: 'Deliverables',
          type: 'LIST',
          value: [
            'Logo',
            'Brand guidelines',
            'Packaging',
          ],
        }),
        field({
          label: 'Creative Process',
          type: 'LONG_TEXT',
          value: 'Research, sketches, and revision.',
        }),
      ],
    }),
  ]);

  const result = projectContentSchema.safeParse(input);

  assert.equal(result.success, true);
});

test('accepts nullable values for unfinished fields', () => {
  const types = [
    'SHORT_TEXT',
    'LONG_TEXT',
    'URL',
    'NUMBER',
    'DATE',
    'BOOLEAN',
  ];

  const input = document([
    section({
      fields: types.map((type) =>
        field({
          type,
          label: `${type} field`,
          value: null,
        }),
      ),
    }),
  ]);

  assert.equal(
    projectContentSchema.safeParse(input).success,
    true,
  );
});

test('rejects unsupported field types', () => {
  const input = document([
    section({
      fields: [
        field({
          type: 'EXECUTABLE_SCRIPT',
          value: 'alert(1)',
        }),
      ],
    }),
  ]);

  assert.equal(
    projectContentSchema.safeParse(input).success,
    false,
  );
});

test('rejects unknown fields and privileged properties', () => {
  const input = document([
    section({
      fields: [
        field({
          profileId: randomUUID(),
        }),
      ],
    }),
  ]);

  assert.equal(
    projectContentSchema.safeParse(input).success,
    false,
  );
});

test('rejects an invalid field value type', () => {
  const input = document([
    section({
      fields: [
        field({
          label: 'Budget',
          type: 'NUMBER',
          value: 'five hundred',
        }),
      ],
    }),
  ]);

  assert.equal(
    projectContentSchema.safeParse(input).success,
    false,
  );
});

test('rejects unsafe URL schemes and embedded credentials', () => {
  const urls = [
    'javascript:alert(1)',
    'file:///etc/passwd',
    'https://user:password@example.com',
  ];

  for (const value of urls) {
    const input = document([
      section({
        fields: [
          field({
            type: 'URL',
            value,
          }),
        ],
      }),
    ]);

    assert.equal(
      projectContentSchema.safeParse(input).success,
      false,
    );
  }
});

test('rejects invalid dates and accepts valid dates', () => {
  const invalid = document([
    section({
      fields: [
        field({
          type: 'DATE',
          value: '2026-02-30',
        }),
      ],
    }),
  ]);

  assert.equal(
    projectContentSchema.safeParse(invalid).success,
    false,
  );

  const valid = document([
    section({
      fields: [
        field({
          type: 'DATE',
          value: '2024-02-29',
        }),
      ],
    }),
  ]);

  assert.equal(
    projectContentSchema.safeParse(valid).success,
    true,
  );
});

test('rejects repeated section IDs', () => {
  const repeatedId = randomUUID();

  const input = document([
    section({ id: repeatedId }),
    section({ id: repeatedId }),
  ]);

  assert.equal(
    projectContentSchema.safeParse(input).success,
    false,
  );
});

test('rejects repeated field IDs across sections', () => {
  const repeatedId = randomUUID();

  const input = document([
    section({
      fields: [
        field({ id: repeatedId }),
      ],
    }),
    section({
      fields: [
        field({ id: repeatedId }),
      ],
    }),
  ]);

  assert.equal(
    projectContentSchema.safeParse(input).success,
    false,
  );
});

test('enforces the total field count limit', () => {
  const sections = Array.from(
    { length: 4 },
    () => section({
      fields: Array.from(
        { length: 26 },
        () => field(),
      ),
    }),
  );

  assert.equal(
    projectContentSchema.safeParse(
      document(sections),
    ).success,
    false,
  );
});

test('rejects oversized content documents', () => {
  const input = document([
    section({
      fields: Array.from(
        { length: 14 },
        () => field({
          type: 'LONG_TEXT',
          value: 'X'.repeat(10000),
        }),
      ),
    }),
  ]);

  assert.equal(
    projectContentSchema.safeParse(input).success,
    false,
  );
});

test('preserves the user-defined section order', () => {
  const first = section({
    title: 'Deliverables',
  });

  const second = section({
    title: 'Results',
  });

  const result = projectContentSchema.parse(
    document([second, first]),
  );

  assert.deepEqual(
    result.sections.map((item) => item.title),
    ['Results', 'Deliverables'],
  );
});

test('rejects unsupported schema versions', () => {
  const input = {
    schemaVersion: 2,
    sections: [],
  };

  assert.equal(
    projectContentSchema.safeParse(input).success,
    false,
  );
});
