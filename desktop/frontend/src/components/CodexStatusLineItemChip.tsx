import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { GripVertical, X } from "lucide-react";
import { codexStatusLineOption } from "./codexStatusLineOptions";

export function CodexStatusLineItemChip({
  sortableId,
  item,
  disabled,
  onRemove,
}: {
  sortableId: string;
  item: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  const option = codexStatusLineOption(item);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId, disabled });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      title={option.description}
      className={`inline-flex h-8 max-w-full items-center rounded-lg border bg-[var(--bg-primary)] text-[11px] text-[var(--text-primary)] shadow-sm transition-[border-color,box-shadow,opacity] ${
        isDragging
          ? "z-10 border-[var(--accent-green)] opacity-25"
          : "border-[var(--border)] hover:border-[var(--text-muted)]/60"
      }`}
    >
      <button
        type="button"
        aria-label={`Move ${option.label}`}
        disabled={disabled}
        {...attributes}
        {...listeners}
        className="flex h-full w-7 shrink-0 cursor-grab items-center justify-center rounded-l-lg text-[var(--text-muted)] outline-none hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-blue)] active:cursor-grabbing disabled:cursor-not-allowed"
      >
        <GripVertical aria-hidden size={12} />
      </button>
      <span className="truncate px-1.5 font-medium">{option.label}</span>
      <button
        type="button"
        aria-label={`Remove ${option.label}`}
        disabled={disabled}
        onClick={onRemove}
        className="flex h-full w-7 shrink-0 items-center justify-center rounded-r-lg text-[var(--text-muted)] outline-none hover:bg-[var(--accent-red)]/10 hover:text-[var(--accent-red-text)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-blue)] disabled:cursor-not-allowed"
      >
        <X aria-hidden size={11} />
      </button>
    </div>
  );
}
