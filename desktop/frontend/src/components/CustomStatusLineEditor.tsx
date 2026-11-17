import { useEffect, useState, type ReactNode } from "react";
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
import { StatusLineAlert } from "./StatusLineAlert";
import { StatusLineOrder } from "./StatusLineOrder";
import { StatusLineSection } from "./StatusLineSection";
import { CARD_CLASS } from "./ui/fields";
import { BTN_SECONDARY } from "./ui/buttons";
import { StatusLineAppearanceSettings } from "./StatusLineAppearanceSettings";
import { StatusLineAddItemButton } from "./StatusLineAddItemButton";
import { StatusLineDragChip } from "./StatusLineDragChip";
import { StatusLineSegmentChip } from "./StatusLineSegmentChip";
import {
  STATUS_LINE_SEGMENT_IDS,
  STATUS_LINE_SEGMENT_LABELS,
  STATUS_LINE_SEPARATORS,
} from "./statusLineEditorOptions";
import { customStatusLineErrorTarget } from "./statusLineValidation";
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
  notice,
}: {
  spec: CustomSpec;
  onChange: (spec: CustomSpec) => void;
  disabled: boolean;
  notice?: ReactNode;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [undoSpec, setUndoSpec] = useState<CustomSpec | null>(null);
  const used = new Set(spec.segments.map((segment) => segment.id));
  const addable = STATUS_LINE_SEGMENT_IDS.filter((id) => !used.has(id));
  const ids = spec.segments.map((segment, index) => `${segment.id}:${index}`);
  const validationError = customStatusLineErrorTarget(spec);
  const invalidSegment =
    validationError?.index != null
      ? spec.segments[validationError.index]
      : undefined;
  const invalidName = invalidSegment
    ? invalidSegment.id === "text"
      ? "Custom text"
      : STATUS_LINE_SEGMENT_LABELS[invalidSegment.id]
    : validationError?.field === "separator"
      ? "Separator"
      : null;
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

  const showInvalid = () => {
    if (validationError?.index != null) {
      setEditingIndex(validationError.index);
    } else if (validationError?.field === "separator") {
      document.getElementById("status-line-separator")?.focus();
    }
  };

  const undo = () => {
    if (!undoSpec) return;
    onChange(undoSpec);
    setUndoSpec(null);
    setEditingIndex(null);
  };

  return (
    <StatusLineSection
      title="Arrange your items"
      description="Drag to reorder. Hover an item to edit or remove it."
    >
      <section className={`${CARD_CLASS} @container overflow-hidden`}>
        <div className="p-4">
          {notice && <div className="mb-3">{notice}</div>}
          <div className="space-y-3">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragCancel={() => setDragIndex(null)}
            >
              <StatusLineOrder
                count={spec.segments.length}
                actions={
                  <>
                    {undoSpec && (
                      <button
                        type="button"
                        onClick={undo}
                        disabled={disabled}
                        className={`${BTN_SECONDARY} inline-flex items-center gap-1.5`}
                      >
                        <Undo2 size={13} /> Undo
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={randomize}
                      disabled={disabled}
                      className={`${BTN_SECONDARY} inline-flex items-center gap-1.5`}
                    >
                      <Sparkles size={13} /> Randomize
                    </button>
                  </>
                }
              >
                <SortableContext items={ids} strategy={rectSortingStrategy}>
                  {spec.segments.map((segment, index) => (
                    <StatusLineSegmentChip
                      key={ids[index]}
                      id={ids[index]}
                      segment={segment}
                      showIcon={spec.icons}
                      editing={editingIndex === index}
                      invalid={validationError?.index === index}
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
                </SortableContext>
              </StatusLineOrder>
              <DragOverlay>
                {dragIndex != null && spec.segments[dragIndex] ? (
                  <StatusLineDragChip
                    segment={spec.segments[dragIndex]}
                    showIcon={spec.icons}
                  />
                ) : null}
              </DragOverlay>
            </DndContext>

            <div className="min-w-0">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-[12px] font-medium text-[var(--text-secondary)]">
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
            <div className="mt-3">
              <StatusLineAlert
                action={
                  invalidName
                    ? { label: "Show me", onClick: showInvalid, disabled }
                    : undefined
                }
              >
                {invalidName ? `${invalidName}: ` : ""}
                {validationError.message} Claude Code keeps your last working line
                until it’s fixed.
              </StatusLineAlert>
            </div>
          )}

          <StatusLineAppearanceSettings
            spec={spec}
            disabled={disabled}
            onChange={commit}
          />
        </div>
      </section>
    </StatusLineSection>
  );
}
