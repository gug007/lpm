import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Plus, Undo2 } from "lucide-react";
import { CodexStatusLineItemChip } from "./CodexStatusLineItemChip";
import { StatusLineOrder } from "./StatusLineOrder";
import { StatusLineSection } from "./StatusLineSection";
import { CARD_CLASS } from "./ui/fields";
import { BTN_SECONDARY } from "./ui/buttons";
import {
  CODEX_STATUS_LINE_GROUPS,
  CODEX_STATUS_LINE_OPTIONS,
  codexStatusLineOption,
} from "./codexStatusLineOptions";

export function CodexStatusLineEditor({
  items,
  disabled,
  undoLabel,
  onItemsChange,
  onUndo,
}: {
  items: string[];
  disabled: boolean;
  undoLabel: string | null;
  onItemsChange: (items: string[], undoLabel?: string) => void;
  onUndo: () => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const sortableIds = items.map((item, index) => `${item}:${index}`);
  const used = new Set(items);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onDragStart = (event: DragStartEvent) => {
    setDragIndex(sortableIds.indexOf(String(event.active.id)));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragIndex(null);
    const from = sortableIds.indexOf(String(event.active.id));
    const to = event.over
      ? sortableIds.indexOf(String(event.over.id))
      : -1;
    if (from < 0 || to < 0 || from === to) return;
    onItemsChange(arrayMove(items, from, to));
  };

  return (
    <StatusLineSection
      title="Arrange your items"
      description="Drag to reorder. Remove every item to hide the line."
    >
      <section className={`${CARD_CLASS} @container overflow-hidden`}>
        <div className="space-y-4 p-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => setDragIndex(null)}
          >
            <StatusLineOrder
              count={items.length}
              actions={
                undoLabel && (
                  <span className="flex min-w-0 items-center gap-2" aria-live="polite">
                    <span className="truncate text-[12px] text-[var(--text-muted)]">{undoLabel}</span>
                    <button
                      type="button"
                      onClick={onUndo}
                      disabled={disabled}
                      className={`${BTN_SECONDARY} inline-flex shrink-0 items-center gap-1.5`}
                    >
                      <Undo2 size={13} /> Undo
                    </button>
                  </span>
                )
              }
            >
              <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
                {items.length === 0 ? (
                  <span className="m-auto text-[12px] text-[var(--text-muted)]">
                    No status line. Pick a layout above or add an item to bring it back.
                  </span>
                ) : (
                  items.map((item, index) => (
                    <CodexStatusLineItemChip
                      key={sortableIds[index]}
                      sortableId={sortableIds[index]}
                      item={item}
                      disabled={disabled}
                      onRemove={() =>
                        onItemsChange(
                          items.filter((_, itemIndex) => itemIndex !== index),
                          items.length === 1
                            ? "Status line turned off"
                            : `Removed ${codexStatusLineOption(item).label}`,
                        )
                      }
                    />
                  ))
                )}
              </SortableContext>
            </StatusLineOrder>
            <DragOverlay>
              {dragIndex != null && items[dragIndex] ? (
                <div className="inline-flex h-8 items-center rounded-lg border border-[var(--accent-green)] bg-[var(--bg-primary)] px-3 text-[11px] font-medium text-[var(--text-primary)] shadow-xl">
                  {codexStatusLineOption(items[dragIndex]).label}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          <div>
            <div className="mb-2">
              <h3 className="text-[12px] font-medium text-[var(--text-secondary)]">
                Add an item
              </h3>
              <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                Codex omits items when their value is unavailable.
              </p>
            </div>
            <div className="divide-y divide-[var(--border)]/60">
              {CODEX_STATUS_LINE_GROUPS.map((group) => {
                const options = CODEX_STATUS_LINE_OPTIONS.filter(
                  (option) => option.group === group && !used.has(option.id),
                );
                if (options.length === 0) return null;
                return (
                  <div key={group} className="flex gap-3 py-2">
                    <h4 className="w-28 shrink-0 pt-1.5 text-[12px] text-[var(--text-muted)]">
                      {group}
                    </h4>
                    <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                      {options.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          aria-label={`Add ${option.label} — ${option.description}`}
                          title={option.description}
                          disabled={disabled}
                          onClick={() => onItemsChange([...items, option.id])}
                          className="group inline-flex h-7 max-w-full items-center gap-1 rounded-md border border-[var(--border)] px-2 text-left outline-none transition-[border-color,background-color,color] hover:border-[var(--text-muted)]/60 hover:bg-[var(--bg-hover)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Plus
                            aria-hidden
                            size={12}
                            className="shrink-0 text-[var(--text-muted)] group-hover:text-[var(--text-primary)]"
                          />
                          <span className="truncate text-[12px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                            {option.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {CODEX_STATUS_LINE_OPTIONS.every((option) => used.has(option.id)) && (
              <p className="py-2 text-[12px] text-[var(--text-muted)]">
                Every supported Codex item is already in your status line.
              </p>
            )}
          </div>
        </div>
      </section>
    </StatusLineSection>
  );
}
