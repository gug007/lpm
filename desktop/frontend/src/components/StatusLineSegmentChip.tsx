import { GripVertical, X } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { StatusLineSegmentContent } from "./StatusLineSegmentContent";
import { StatusLineSegmentPopover } from "./StatusLineSegmentPopover";
import { STATUS_LINE_SEGMENT_LABELS } from "./statusLineEditorOptions";
import type { Segment } from "./statusLineTypes";

export function StatusLineSegmentChip({
  id,
  segment,
  showIcon,
  editing,
  invalid = false,
  disabled,
  canRemove,
  onEdit,
  onClose,
  onUpdate,
  onRemove,
}: {
  id: string;
  segment: Segment;
  showIcon: boolean;
  editing: boolean;
  invalid?: boolean;
  disabled: boolean;
  canRemove: boolean;
  onEdit: () => void;
  onClose: () => void;
  onUpdate: (patch: Partial<Segment>) => void;
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
  // Edit and remove show on hover or focus, and stay while the item is open
  // or needs fixing.
  const pinned = editing || invalid;
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
      data-invalid={invalid || undefined}
      className={`group relative inline-flex h-8 items-center rounded-lg border text-[12px] text-[var(--text-primary)] shadow-sm transition-[border-color,background-color,box-shadow] ${
        invalid
          ? "border-[var(--accent-red)] bg-[var(--accent-red)]/8"
          : editing
            ? "border-[var(--accent-green)]/80 bg-[var(--accent-green)]/8"
            : "border-[var(--border)] bg-[var(--bg-primary)]/70 hover:border-[var(--text-muted)]/55 hover:bg-[var(--bg-hover)]"
      }`}
    >
      <button
        type="button"
        disabled={disabled}
        {...attributes}
        {...listeners}
        aria-label={`Move ${label}`}
        title="Drag to reorder"
        className="flex h-8 w-6 touch-none cursor-grab items-center justify-center rounded-l-lg text-[var(--text-muted)]/70 outline-none hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-blue)] active:cursor-grabbing disabled:cursor-default"
      >
        <GripVertical size={12} />
      </button>
      <span className={`flex h-8 items-center gap-1.5 ${pinned ? "pr-1" : "pr-2.5"}`}>
        <StatusLineSegmentContent segment={segment} showIcon={showIcon} />
      </span>
      <span
        className={
          pinned
            ? "flex items-center pr-0.5"
            : "absolute inset-y-0 right-0 flex items-center rounded-r-lg bg-[var(--bg-hover)] pl-1 pr-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        }
      >
        <StatusLineSegmentPopover
          segment={segment}
          open={editing}
          disabled={disabled}
          canRemove={canRemove}
          onToggle={onEdit}
          onUpdate={onUpdate}
          onRemove={onRemove}
          onClose={onClose}
        />
        <button
          type="button"
          disabled={disabled || !canRemove}
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          title={canRemove ? `Remove ${label}` : "Keep at least one item"}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--accent-red)]/10 hover:text-[var(--accent-red-text)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <X size={12} />
        </button>
      </span>
    </div>
  );
}
