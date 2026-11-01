import { useState } from 'react';
import type { ReactNode } from 'react';

import {
  expect,
  test,
  vi,
} from 'vitest';

import '@testing-library/jest-dom/vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';

import { ProjectContentBuilder } from './ProjectContentBuilder';

import type {
  ProjectContent,
  VersionedRecord,
} from './portfolio.types';

// Isolate project-content behavior from browser drag geometry.
// The real drag engine is tested by SortablePortfolioList tests.
expect.extend(matchers);
vi.mock('./SortablePortfolioList', () => ({
  SortablePortfolioList: ({
    items,
    disabled,
    label,
    renderItem,
    onReorder,
  }: {
    items: readonly VersionedRecord[];
    disabled: boolean;
    label: (item: VersionedRecord) => string;
    renderItem: (
      item: VersionedRecord,
      index: number,
    ) => ReactNode;
    onReorder: (
      items: VersionedRecord[],
    ) => Promise<boolean>;
  }) => (
    <div role="list">
      {items.map((item, index) => (
        <div role="listitem" key={item.id}>
          {!disabled && index > 0 && (
            <button
              type="button"
              onClick={() => {
                const reordered = [...items];

                [
                  reordered[index - 1],
                  reordered[index],
                ] = [
                  reordered[index]!,
                  reordered[index - 1]!,
                ];

                void onReorder(
                  reordered.map((record) => ({
                    id: record.id,
                    version: record.version,
                  })),
                );
              }}
              aria-label={`Simulate drag ${label(item)} up`}
            >
              Simulate drag
            </button>
          )}

          {renderItem(item, index)}
        </div>
      ))}
    </div>
  ),
}));

function Harness({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const [content, setContent] = useState<ProjectContent>({
    schemaVersion: 1,
    sections: [],
  });

  return (
    <>
      <ProjectContentBuilder
        value={content}
        disabled={disabled}
        onChange={setContent}
      />

      <output data-testid="content-json">
        {JSON.stringify(content)}
      </output>
    </>
  );
}

function currentContent(): ProjectContent {
  return JSON.parse(
    screen.getByTestId('content-json').textContent ?? '{}',
  ) as ProjectContent;
}

test('creates a custom section and editable text field', () => {
  render(<Harness />);

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Add section',
    }),
  );

  fireEvent.change(
    screen.getByLabelText('Section title'),
    {
      target: { value: 'Brand Design' },
    },
  );

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Add field',
    }),
  );

  fireEvent.change(
    screen.getByLabelText('Field name'),
    {
      target: { value: 'Client name' },
    },
  );

  fireEvent.change(
    screen.getByLabelText('Field value'),
    {
      target: { value: 'Café Luna' },
    },
  );

  const content = currentContent();

  expect(content.schemaVersion).toBe(1);
  expect(content.sections).toHaveLength(1);
  expect(content.sections[0]?.title).toBe('Brand Design');

  expect(content.sections[0]?.fields[0]).toMatchObject({
    label: 'Client name',
    type: 'SHORT_TEXT',
    value: 'Café Luna',
  });

  expect(
    content.sections[0]?.fields[0],
  ).not.toHaveProperty('version');

  expect(content.sections[0]?.id).toMatch(
    /^[0-9a-f-]{36}$/,
  );

  expect(content.sections[0]?.fields[0]?.id).toMatch(
    /^[0-9a-f-]{36}$/,
  );
});

test('supports profession-neutral list fields', () => {
  render(<Harness />);

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Add section',
    }),
  );

  fireEvent.change(
    screen.getByLabelText('New field type'),
    {
      target: { value: 'LIST' },
    },
  );

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Add field',
    }),
  );

  fireEvent.change(
    screen.getByLabelText('Field name'),
    {
      target: { value: 'Deliverables' },
    },
  );

  fireEvent.change(
    screen.getByLabelText('List items'),
    {
      target: {
        value: 'Logo\nPackaging\nBrand guidelines',
      },
    },
  );

  expect(
    currentContent().sections[0]?.fields[0],
  ).toMatchObject({
    label: 'Deliverables',
    type: 'LIST',
    value: [
      'Logo',
      'Packaging',
      'Brand guidelines',
    ],
  });
});

test('can reorder custom sections without changing their IDs', () => {
  render(<Harness />);

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Add section',
    }),
  );

  fireEvent.change(
    screen.getByLabelText('Section title'),
    {
      target: { value: 'Overview' },
    },
  );

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Add section',
    }),
  );

  fireEvent.change(
    screen.getByLabelText('Section title'),
    {
      target: { value: 'Results' },
    },
  );

  const before = currentContent().sections;

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Simulate drag Results up',
    }),
  );

  const after = currentContent().sections;

  expect(after.map((section) => section.title))
    .toEqual(['Results', 'Overview']);

  expect(after[0]?.id).toBe(before[1]?.id);
  expect(after[1]?.id).toBe(before[0]?.id);
});

test('removes custom fields without deleting the section', () => {
  render(<Harness />);

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Add section',
    }),
  );

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Add field',
    }),
  );

  expect(
    currentContent().sections[0]?.fields,
  ).toHaveLength(1);

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Remove field',
    }),
  );

  expect(
    currentContent().sections,
  ).toHaveLength(1);

  expect(
    currentContent().sections[0]?.fields,
  ).toHaveLength(0);
});

test('disables content editing for read-only use', () => {
  render(<Harness disabled />);

  expect(
    screen.getByRole('button', {
      name: 'Add section',
    }),
  ).toBeDisabled();

  expect(currentContent().sections).toEqual([]);
});
