import {
  useRef,
  useState,
} from 'react';

import type { ReactNode } from 'react';
import { DragDropProvider } from '@dnd-kit/react';

import {
  isSortable,
  useSortable,
} from '@dnd-kit/react/sortable';

import type {
  VersionedRecord,
} from './portfolio.types';

import {
  reorderItems,
  toVersionedOrder,
} from './reorder-items';

import './sortable-portfolio.css';

interface SortableListProps<T extends VersionedRecord> {
  items: readonly T[];

  disabled?: boolean;
  showHandles?: boolean;

  label: (item: T) => string;

  renderItem: (
    item: T,
    index: number,
  ) => ReactNode;

  onReorder: (
    items: VersionedRecord[],
  ) => Promise<boolean>;
}

interface SortableRowProps<T extends VersionedRecord> {
  item: T;
  index: number;
  disabled: boolean;
  showHandle: boolean;

  label: (item: T) => string;

  renderItem: (
    item: T,
    index: number,
  ) => ReactNode;
}

function SortableRow<T extends VersionedRecord>({
  item,
  index,
  disabled,
  showHandle,
  label,
  renderItem,
}: SortableRowProps<T>) {
  const {
    ref,
    handleRef,
    isDragging,
  } = useSortable({
    id: item.id,
    index,
    disabled,
  });

  return (
    <div
      ref={ref}
      role="listitem"
      className={[
        'sortable-portfolio-row',
        isDragging
          ? 'sortable-portfolio-row--dragging'
          : '',
      ].filter(Boolean).join(' ')}
    >
      {showHandle && (
        <button
          ref={handleRef}
          type="button"
          className="sortable-portfolio-handle"
          disabled={disabled}
          aria-label={`Drag ${label(item)} to reorder`}
          title={`Drag ${label(item)} to reorder`}
        >
          <span aria-hidden="true">⠿</span>
        </button>
      )}

      <div className="sortable-portfolio-content">
        {renderItem(item, index)}
      </div>
    </div>
  );
}

/**
 * Shared sortable component for Projects, Skills,
 * Certifications and future profile content.
 *
 * The server owns the authoritative order.
 * No version increments happen on the client.
 */
export function SortablePortfolioList<
  T extends VersionedRecord
>({
  items,
  disabled = false,
  showHandles = true,
  label,
  renderItem,
  onReorder,
}: SortableListProps<T>) {
  // Prevent overlapping order-saving requests.
  const savingRef = useRef(false);

  // Reset the dnd context after a successful or
  // rejected operation so its DOM order is consistent
  // with authoritative React state.
  const [dragCycle, setDragCycle] = useState(0);

  async function saveReorderedItems(
    reordered: readonly T[],
  ) {
    if (disabled || savingRef.current) {
      return;
    }

    savingRef.current = true;

    try {
      await onReorder(
        toVersionedOrder(reordered),
      );
    } finally {
      savingRef.current = false;
      setDragCycle((current) => current + 1);
    }
  }

  return (
    <DragDropProvider
      key={dragCycle}
      onDragEnd={(event) => {
        if (event.canceled || disabled) {
          setDragCycle((current) => current + 1);
          return;
        }

        const source = event.operation.source;

        if (!isSortable(source)) {
          return;
        }

        const {
          initialIndex,
          index,
        } = source;

        if (initialIndex === index) {
          return;
        }

        if (
          initialIndex < 0 ||
          index < 0 ||
          initialIndex >= items.length ||
          index >= items.length
        ) {
          return;
        }

        const reordered = reorderItems(
          items,
          initialIndex,
          index,
        );

        // The parent displays failures and conflict
        // recovery messages. This component resets
        // any optimistic drag state afterward.
        void saveReorderedItems(reordered);
      }}
    >
      <div
        role="list"
        aria-label="Reorderable items"
        className="sortable-portfolio-list"
      >
        {items.map((item, index) => (
          <SortableRow
            key={item.id}
            item={item}
            index={index}
            disabled={disabled}
            showHandle={
              showHandles && items.length > 1
            }
            label={label}
            renderItem={renderItem}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}
