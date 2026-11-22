import { useDraggable } from "@dnd-kit/core";
import { ROW_DETAIL_INFO } from "../sidebarRowDetails";
import type { RowDetail } from "../sidebarRowLayout";
import { RowDetailFace } from "./RowDetailFace";

interface RowLayoutChipProps {
  detail: RowDetail;
  // What the previewed project would show.
  value?: string;
  picked: boolean;
  onPick: () => void;
}

/** A detail in the Row builder's tray: drag it onto the row, or press it to
 *  pick it and then press + where it should go. */
export function RowLayoutChip({ detail, value, picked, onPick }: RowLayoutChipProps) {
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: detail });
  const { label, hint } = ROW_DETAIL_INFO[detail];

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      onClick={onPick}
      data-row-chip={detail}
      aria-pressed={picked}
      aria-label={`${label}. Drag it onto the row, or press to pick it and then press + where it goes`}
      title={hint}
      className={`inline-flex h-7 max-w-full touch-none cursor-grab items-center gap-1.5 rounded-md border bg-[var(--bg-primary)] px-2 text-[12px] text-[var(--text-primary)] shadow-sm outline-none transition-[border-color,box-shadow] focus-visible:ring-1 focus-visible:ring-[var(--accent-cyan)] active:cursor-grabbing ${
        picked
          ? "border-[var(--accent-cyan)] ring-2 ring-[var(--accent-cyan)]/25"
          : "border-[var(--border)] hover:border-[var(--text-muted)]/60"
      } ${isDragging ? "opacity-35" : ""}`}
    >
      <RowDetailFace detail={detail} value={value} />
    </button>
  );
}
