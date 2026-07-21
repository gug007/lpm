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
import { Plus } from "lucide-react";
import { CodexStatusLineItemChip } from "./CodexStatusLineItemChip";
import { StatusLineToggle } from "./StatusLineToggle";
import {
  CODEX_STATUS_LINE_GROUPS,
  CODEX_STATUS_LINE_OPTIONS,
  codexStatusLineOption,
} from "./codexStatusLineOptions";

export function CodexStatusLineEditor({
  items,
  useColors,
  disabled,
  onItemsChange,
  onUseColorsChange,
}: {
  items: string[];
  useColors: boolean;
  disabled: boolean;
  onItemsChange: (items: string[]) => void;
  onUseColorsChange: (useColors: boolean) => void;
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
    <section className="@container overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]/35">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className="rounded-md bg-[var(--accent-green)]/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-green-text)]">
              Build
            </span>
            <div className="min-w-0">
              <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
                Arrange your items
              </h2>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                Drag to reorder. Remove every item to hide the line.
              </p>
            </div>
          </div>
        </div>
        <StatusLineToggle
          checked={useColors}
          disabled={disabled}
          label="Use theme colors"
          description="Let Codex apply colors from its active theme"
          onChange={onUseColorsChange}
        />
      </div>

      <div className="space-y-4 p-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium text-[var(--text-secondary)]">
              Status line order
            </span>
            <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => setDragIndex(null)}
          >
            <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
              <div className="flex min-h-14 flex-wrap content-start items-start gap-1.5 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-primary)]/55 p-2">
                {items.length === 0 ? (
                  <span className="m-auto text-[10.5px] text-[var(--text-muted)]">
                    Status line hidden. Add an item below to turn it back on.
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
                        )
                      }
                    />
                  ))
                )}
              </div>
            </SortableContext>
            <DragOverlay>
              {dragIndex != null && items[dragIndex] ? (
                <div className="inline-flex h-8 items-center rounded-lg border border-[var(--accent-green)] bg-[var(--bg-primary)] px-3 text-[11px] font-medium text-[var(--text-primary)] shadow-xl">
                  {codexStatusLineOption(items[dragIndex]).label}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="text-[11px] font-semibold text-[var(--text-secondary)]">
              Add an item
            </h3>
            <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
              Codex omits items when their value is unavailable.
            </p>
          </div>
          {CODEX_STATUS_LINE_GROUPS.map((group) => {
            const options = CODEX_STATUS_LINE_OPTIONS.filter(
              (option) => option.group === group && !used.has(option.id),
            );
            if (options.length === 0) return null;
            return (
              <div key={group}>
                <h4 className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  {group}
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-label={`Add ${option.label} — ${option.description}`}
                      title={option.description}
                      disabled={disabled}
                      onClick={() => onItemsChange([...items, option.id])}
                      className="group inline-flex h-8 max-w-full items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]/50 px-2.5 text-left outline-none transition-[border-color,background-color,color] hover:border-[var(--accent-green)]/45 hover:bg-[var(--bg-hover)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus
                        aria-hidden
                        size={11}
                        className="shrink-0 text-[var(--text-muted)] group-hover:text-[var(--accent-green-text)]"
                      />
                      <span className="truncate text-[10.5px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                        {option.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {CODEX_STATUS_LINE_OPTIONS.every((option) => used.has(option.id)) && (
            <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-[10.5px] text-[var(--text-muted)]">
              Every supported Codex item is already in your status line.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
