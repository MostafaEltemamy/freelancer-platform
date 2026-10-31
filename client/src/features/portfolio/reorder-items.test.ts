import { expect, test } from 'vitest';

import {
  reorderItems,
  toVersionedOrder,
} from './reorder-items';

const items = [
  { id: 'a', version: 1, name: 'First' },
  { id: 'b', version: 2, name: 'Second' },
  { id: 'c', version: 3, name: 'Third' },
];

test('moves an item upward', () => {
  const result = reorderItems(items, 2, 0);

  expect(result.map((item) => item.id)).toEqual([
    'c', 'a', 'b',
  ]);
});

test('moves an item downward', () => {
  const result = reorderItems(items, 0, 2);

  expect(result.map((item) => item.id)).toEqual([
    'b', 'c', 'a',
  ]);
});

test('does not mutate the original array', () => {
  reorderItems(items, 0, 2);

  expect(items.map((item) => item.id)).toEqual([
    'a', 'b', 'c',
  ]);
});

test('rejects invalid indexes', () => {
  expect(() => reorderItems(items, -1, 2))
    .toThrow(RangeError);

  expect(() => reorderItems(items, 0, 5))
    .toThrow(RangeError);
});

test('preserves server versions in reorder payloads', () => {
  const reordered = reorderItems(items, 2, 0);

  expect(toVersionedOrder(reordered)).toEqual([
    { id: 'c', version: 3 },
    { id: 'a', version: 1 },
    { id: 'b', version: 2 },
  ]);
});
