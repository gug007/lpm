import { GripVertical, X } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { StatusLineSegmentContent } from "./StatusLineSegmentContent";
import { STATUS_LINE_SEGMENT_LABELS } from "./statusLineEditorOptions";
import type { Segment } from "./statusLineTypes";

export function StatusLineSegmentChip({
  id,
  segment,
  showIcon,
  selected,
  disabled,
  canRemove,
  onSelect,
  onRemove,
}: {
  id: string;
  segment: Segment;
  showIcon: boolean;
  selected: boolean;
  disabled: boolean;
  canRemove: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled,
  });
  const label =
    segment.id === "text"
      ? segment.text || "Custom text"
      : STATUS_LINE_SEGMENT_LABELS[segment.id];

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
      }}
      className={`group inline-flex min-h-9 items-center rounded-lg border text-[12px] text-[var(--text-primary)] transition-colors ${
        selected
          ? "border-[var(--accent-green)] bg-[var(--accent-green)]/10"
          : "border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--text-muted)]/60 hover:bg-[var(--bg-hover)]"
      }`}
    >
      <button
        type="button"
        disabled={disabled}
        {...attributes}
        {...listeners}
        aria-label={`Move ${label}`}
        title="Drag to reorder"
        className="flex h-9 w-7 touch-none cursor-grab items-center justify-center rounded-l-lg text-[var(--text-muted)] outline-none hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-blue)] active:cursor-grabbing disabled:cursor-default"
      >
        <GripVertical size={14} />
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        onClick={onSelect}
        className="flex h-9 items-center gap-1.5 px-1 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-blue)]"
      >
        <StatusLineSegmentContent segment={segment} showIcon={showIcon} />
      </button>
      <button
        type="button"
        disabled={disabled || !canRemove}
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        title={canRemove ? `Remove ${label}` : "Keep at least one item"}
        className="mr-1 flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] opacity-60 outline-none transition-colors hover:bg-[var(--accent-red)]/10 hover:text-[var(--accent-red-text)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-25"
      >
        <X size={13} />
      </button>
    </div>
  );
}
