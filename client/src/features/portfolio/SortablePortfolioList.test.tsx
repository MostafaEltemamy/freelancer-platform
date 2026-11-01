import type { ReactNode } from 'react';

import {
  expect,
  test,
  vi,
} from 'vitest';

import * as matchers from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom/vitest';

import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import { SortablePortfolioList } from './SortablePortfolioList';

expect.extend(matchers);

// Mock only the external browser drag-and-drop engine.
// The real SortablePortfolioList logic remains under test.
vi.mock('@dnd-kit/react', () => ({
  DragDropProvider: ({
    children,
    onDragEnd,
  }: {
    children: ReactNode;
    onDragEnd: (event: {
      canceled: boolean;
      operation: {
        source: {
          initialIndex: number;
          index: number;
        };
      };
    }) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onDragEnd({
            canceled: false,
            operation: {
              source: {
                initialIndex: 1,
                index: 0,
              },
            },
          })
        }
      >
        Simulate completed drag
      </button>

      <button
        type="button"
        onClick={() =>
          onDragEnd({
            canceled: true,
            operation: {
              source: {
                initialIndex: 1,
                index: 0,
              },
            },
          })
        }
      >
        Simulate canceled drag
      </button>

      <button
        type="button"
        onClick={() =>
          onDragEnd({
            canceled: false,
            operation: {
              source: {
                initialIndex: 0,
                index: 0,
              },
            },
          })
        }
      >
        Simulate unchanged drag
      </button>

      {children}
    </div>
  ),
}));

vi.mock('@dnd-kit/react/sortable', () => ({
  isSortable: (
    source: unknown,
  ): source is {
    initialIndex: number;
    index: number;
  } => (
    typeof source === 'object' &&
    source !== null &&
    'initialIndex' in source &&
    'index' in source
  ),

  useSortable: () => ({
    ref: () => {},
    handleRef: () => {},
    isDragging: false,
  }),
}));

const items = [
  {
    id: 'first',
    version: 1,
    name: 'First Skill',
  },
  {
    id: 'second',
    version: 3,
    name: 'Second Skill',
  },
];

function renderList(
  onReorder: (
    items: Array<{ id: string; version: number }>,
  ) => Promise<boolean>,
  disabled = false,
) {
  return render(
    <SortablePortfolioList
      items={items}
      disabled={disabled}
      label={(item) => item.name}
      renderItem={(item) => <p>{item.name}</p>}
      onReorder={onReorder}
    />,
  );
}

test('submits the complete versioned order after a drag', async () => {
  const onReorder = vi.fn().mockResolvedValue(true);

  renderList(onReorder);

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Simulate completed drag',
    }),
  );

  await waitFor(() => {
    expect(onReorder).toHaveBeenCalledWith([
      { id: 'second', version: 3 },
      { id: 'first', version: 1 },
    ]);
  });

  expect(onReorder).toHaveBeenCalledTimes(1);
});

test('does not submit an order after a canceled drag', () => {
  const onReorder = vi.fn().mockResolvedValue(true);

  renderList(onReorder);

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Simulate canceled drag',
    }),
  );

  expect(onReorder).not.toHaveBeenCalled();
});

test('does not submit an unchanged order', () => {
  const onReorder = vi.fn().mockResolvedValue(true);

  renderList(onReorder);

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Simulate unchanged drag',
    }),
  );

  expect(onReorder).not.toHaveBeenCalled();
});

test('disables dragging while saving or read-only', () => {
  const onReorder = vi.fn().mockResolvedValue(true);

  renderList(onReorder, true);

  expect(
    screen.getByRole('button', {
      name: 'Drag First Skill to reorder',
    }),
  ).toBeDisabled();

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Simulate completed drag',
    }),
  );

  expect(onReorder).not.toHaveBeenCalled();
});

test('does not treat a rejected reorder as a successful save', async () => {
  const onReorder = vi.fn().mockResolvedValue(false);

  renderList(onReorder);

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Simulate completed drag',
    }),
  );

  await waitFor(() => {
    expect(onReorder).toHaveBeenCalledTimes(1);
  });

  // The component does not update or increment the
  // authoritative item versions on its own.
  expect(items[0].version).toBe(1);
  expect(items[1].version).toBe(3);
});
