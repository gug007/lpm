import { useEffect, useState } from "react";
import { Sparkles, Undo2 } from "lucide-react";
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
import { StatusLineAppearanceSettings } from "./StatusLineAppearanceSettings";
import { StatusLineAddItemButton } from "./StatusLineAddItemButton";
import { StatusLineDragChip } from "./StatusLineDragChip";
import { StatusLineSegmentChip } from "./StatusLineSegmentChip";
import {
  STATUS_LINE_SEGMENT_IDS,
  STATUS_LINE_SEPARATORS,
} from "./statusLineEditorOptions";
import { customStatusLineError } from "./statusLineValidation";
import type {
  CustomSpec,
  SegColor,
  Segment,
  SegmentId,
} from "./statusLineTypes";

export type {
  CustomSpec,
  MeterStyle,
  SegColor,
  Segment,
  SegmentId,
} from "./statusLineTypes";

const randomItem = <T,>(items: readonly T[]): T =>
  items[Math.floor(Math.random() * items.length)];

export function CustomStatusLineEditor({
  spec,
  onChange,
  disabled,
}: {
  spec: CustomSpec;
  onChange: (spec: CustomSpec) => void;
  disabled: boolean;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [undoSpec, setUndoSpec] = useState<CustomSpec | null>(null);
  const used = new Set(spec.segments.map((segment) => segment.id));
  const addable = STATUS_LINE_SEGMENT_IDS.filter((id) => !used.has(id));
  const ids = spec.segments.map((segment, index) => `${segment.id}:${index}`);
  const validationError = customStatusLineError(spec);
  const canRemove = spec.segments.length > 1;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    setEditingIndex((current) =>
      current != null && current >= spec.segments.length ? null : current,
    );
  }, [spec.segments.length]);

  const commit = (next: CustomSpec) => {
    setUndoSpec(null);
    onChange(next);
  };

  const withSegments = (segments: Segment[]): CustomSpec => ({
    ...spec,
    segments,
    gitStatus:
      spec.gitStatus && segments.some((segment) => segment.id === "branch"),
  });

  const setSegments = (segments: Segment[]) => {
    commit(withSegments(segments));
  };

  const update = (index: number, patch: Partial<Segment>) => {
    setSegments(
      spec.segments.map((segment, itemIndex) =>
        itemIndex === index ? { ...segment, ...patch } : segment,
      ),
    );
  };

  const remove = (index: number) => {
    if (!canRemove) return;
    setEditingIndex(null);
    const segments = spec.segments.filter(
      (_, itemIndex) => itemIndex !== index,
    );
    setUndoSpec(spec);
    onChange(withSegments(segments));
  };

  const add = (id: SegmentId) => {
    const index = spec.segments.length;
    setSegments([...spec.segments, { id, color: "default", text: "" }]);
    setEditingIndex(index);
  };

  const onDragStart = (event: DragStartEvent) => {
    setEditingIndex(null);
    setDragIndex(ids.indexOf(String(event.active.id)));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragIndex(null);
    const from = ids.indexOf(String(event.active.id));
    const to = event.over ? ids.indexOf(String(event.over.id)) : -1;
    if (from < 0 || to < 0 || from === to) return;
    setSegments(arrayMove(spec.segments, from, to));
  };

  const randomize = () => {
    const accents: SegColor[] = [
      "cyan",
      "green",
      "magenta",
      "blue",
      "yellow",
      "claude",
    ];
    const optional: SegmentId[] = ["ctx", "five", "seven", "cost", "branch"];
    const chosen: SegmentId[] = [
      "folder",
      "model",
      ...optional.filter(() => Math.random() > 0.45),
    ];
    if (!chosen.includes("five") && !chosen.includes("seven"))
      chosen.push("five");
    const segments: Segment[] = chosen.map((id) => ({
      id,
      text: "",
      color: Math.random() > 0.3 ? randomItem(accents) : "default",
    }));
    setUndoSpec(spec);
    onChange({
      segments,
      separator: randomItem(STATUS_LINE_SEPARATORS),
      meterStyle: randomItem([
        "bar",
        "blocks",
        "shade",
        "segments",
        "dots",
        "squares",
        "braille",
      ] as const),
      meterWidth: randomItem([5, 7, 9]),
      icons: true,
      gitStatus: chosen.includes("branch"),
    });
    setEditingIndex(null);
  };

  const undo = () => {
    if (!undoSpec) return;
    onChange(undoSpec);
    setUndoSpec(null);
    setEditingIndex(null);
  };

  return (
    <section className="@container overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]/35">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-3.5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="rounded-md bg-[var(--accent-green)]/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-green-text)]">
            Build
          </span>
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
              Arrange your items
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              Drag to reorder. Use Edit to customize an item.
            </p>
          </div>
        </div>
        {undoSpec && (
          <button
            type="button"
            onClick={undo}
            disabled={disabled}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-[var(--text-secondary)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:opacity-40"
          >
            <Undo2 size={13} /> Undo
          </button>
        )}
        <button
          type="button"
          onClick={randomize}
          disabled={disabled}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 text-[11px] font-medium text-[var(--text-secondary)] outline-none transition-colors hover:border-[var(--accent-blue)]/50 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:opacity-40"
        >
          <Sparkles size={13} /> Randomize
        </button>
      </div>

      <div className="p-4">
        <div className="space-y-3">
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                Status line order
              </span>
              <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
                {spec.segments.length}{" "}
                {spec.segments.length === 1 ? "item" : "items"}
              </span>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragCancel={() => setDragIndex(null)}
            >
              <SortableContext items={ids} strategy={rectSortingStrategy}>
                <div className="flex min-h-14 flex-wrap content-start items-start gap-1.5 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-primary)]/55 p-2">
                  {spec.segments.map((segment, index) => (
                    <StatusLineSegmentChip
                      key={ids[index]}
                      id={ids[index]}
                      segment={segment}
                      showIcon={spec.icons}
                      editing={editingIndex === index}
                      disabled={disabled}
                      canRemove={canRemove}
                      onEdit={() =>
                        setEditingIndex((current) =>
                          current === index ? null : index,
                        )
                      }
                      onClose={() => setEditingIndex(null)}
                      onUpdate={(patch) => update(index, patch)}
                      onRemove={() => remove(index)}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay>
                {dragIndex != null && spec.segments[dragIndex] ? (
                  <StatusLineDragChip
                    segment={spec.segments[dragIndex]}
                    showIcon={spec.icons}
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>

          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                Add item
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {addable.map((id) => (
                <StatusLineAddItemButton
                  key={id}
                  id={id}
                  onClick={() => add(id)}
                  disabled={disabled}
                />
              ))}
              <StatusLineAddItemButton
                id="text"
                onClick={() => add("text")}
                disabled={disabled}
              />
            </div>
          </div>
        </div>

        {validationError && (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/8 px-3 py-2 text-[10.5px] text-[var(--accent-red-text)]"
          >
            Fix the highlighted setting to update Claude Code. {validationError}
          </div>
        )}

        <StatusLineAppearanceSettings
          spec={spec}
          disabled={disabled}
          onChange={commit}
        />
      </div>
    </section>
  );
}
