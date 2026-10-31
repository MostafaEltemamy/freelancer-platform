import type { ReactNode } from 'react';
import { DragDropProvider } from '@dnd-kit/react';
import {
  isSortable,
  useSortable,
} from '@dnd-kit/react/sortable';

import type { VersionedRecord } from './portfolio.types';

import {
  reorderItems,
  toVersionedOrder,
} from './reorder-items';

import './sortable-portfolio.css';

interface SortableListProps<T extends VersionedRecord> {
  items: readonly T[];
  disabled?: boolean;
  label: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  onReorder: (items: VersionedRecord[]) => Promise<boolean>;
}

interface SortableRowProps<T extends VersionedRecord> {
  item: T;
  index: number;
  disabled: boolean;
  label: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
}

function SortableRow<T extends VersionedRecord>({
  item,
  index,
  disabled,
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
      className={[
        'sortable-portfolio-row',
        isDragging ? 'sortable-portfolio-row--dragging' : '',
      ].filter(Boolean).join(' ')}
    >
      <button
        ref={handleRef}
        type="button"
        className="sortable-portfolio-handle"
        disabled={disabled}
        aria-label={`Drag ${label(item)} to reorder`}
        title="Drag to reorder"
      >
        <span aria-hidden="true">⠿</span>
      </button>

      <div className="sortable-portfolio-content">
        {renderItem(item, index)}
      </div>
    </div>
  );
}

/**
 * Shared drag-and-drop foundation for versioned lists.
 *
 * The parent remains responsible for saving the order
 * and refreshing authoritative server data.
 */
export function SortablePortfolioList<
  T extends VersionedRecord
>({
  items,
  disabled = false,
  label,
  renderItem,
  onReorder,
}: SortableListProps<T>) {
  return (
    <DragDropProvider
      onDragEnd={(event) => {
        if (event.canceled || disabled) {
          return;
        }

        const { source } = event.operation;

        if (!isSortable(source)) {
          return;
        }

        const { initialIndex, index } = source;

        if (initialIndex === index) {
          return;
        }

        const reordered = reorderItems(
          items,
          initialIndex,
          index,
        );

        void onReorder(
          toVersionedOrder(reordered),
        );
      }}
    >
      <div className="sortable-portfolio-list">
        {items.map((item, index) => (
          <SortableRow
            key={item.id}
            item={item}
            index={index}
            disabled={disabled}
            label={label}
            renderItem={renderItem}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}
