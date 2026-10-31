import type { VersionedRecord } from './portfolio.types';

/**
 * Returns a reordered copy without modifying the original array.
 * Invalid indexes are rejected rather than silently changing data.
 */
export function reorderItems<T>(
  items: readonly T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    throw new RangeError('Invalid reorder indexes.');
  }

  const result = [...items];

  if (fromIndex === toIndex) {
    return result;
  }

  const [moved] = result.splice(fromIndex, 1);

  result.splice(toIndex, 0, moved!);

  return result;
}

/**
 * Keep only the fields required by our version-aware
 * reorder API. Never increment versions on the client.
 */
export function toVersionedOrder<
  T extends VersionedRecord
>(
  items: readonly T[],
): VersionedRecord[] {
  return items.map((item) => ({
    id: item.id,
    version: item.version,
  }));
}
