import { useDndContext, useDraggable } from "@dnd-kit/core";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { ROW_DETAIL_INFO } from "../sidebarRowDetails";
import type { RowDetail } from "../sidebarRowLayout";
import { RowDetailFace } from "./RowDetailFace";
import { ROW_DETAIL_LOOK } from "./rowDetailLook";
import { Tooltip } from "./ui/Tooltip";

interface RowLayoutStageItemProps {
  detail: RowDetail;
  // What the sidebar draws for it, or null when the sample project has none.
  content: ReactNode | null;
  // The same as text for the tooltip: empty for nothing, left out for a detail
  // the row draws from elsewhere.
  value: string | undefined;
  // Right sides keep their details whole; on the left they give way.
  whole: boolean;
  picked: boolean;
  onPick: () => void;
  onHide: () => void;
}

/** A detail on the Row builder's copy of a row, drawn as the sidebar draws it:
 *  drag it, press it to pick it, or hover it for the × that hides it. */
export function RowLayoutStageItem({ detail, content, value, whole, picked, onPick, onHide }: RowLayoutStageItemProps) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: detail });
  const dragging = useDndContext().active !== null;
  const { label } = ROW_DETAIL_INFO[detail];
  const { Icon } = ROW_DETAIL_LOOK[detail];

  return (
    <span
      ref={setNodeRef}
      data-row-item={detail}
      className={`group/item relative flex items-center ${whole ? "shrink-0" : "min-w-4 shrink"} ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      {/* Drawn outside the bigger copy of the row, so it reads at its usual size. */}
      <Tooltip
        content={
          <span className="flex items-center gap-1.5">
            <RowDetailFace detail={detail} value={content ? value : ""} />
          </span>
        }
        delay={200}
        disabled={dragging}
        triggerClassName="flex min-w-0"
      >
        <button
          type="button"
          {...listeners}
          onClick={onPick}
          aria-pressed={picked}
          aria-label={`${label}. Drag it, or press to pick it and choose where it goes`}
          className={`-mx-0.5 flex min-w-0 cursor-grab touch-none items-center overflow-hidden rounded-[3px] px-0.5 outline-none active:cursor-grabbing ${
            picked
              ? "bg-[var(--accent-cyan)]/15 ring-1 ring-[var(--accent-cyan)]"
              : "hover:bg-[var(--text-primary)]/10 hover:ring-1 hover:ring-[var(--text-primary)]/20 focus-visible:ring-1 focus-visible:ring-[var(--accent-cyan)]"
          }`}
        >
          <span className="pointer-events-none flex min-w-0 items-center overflow-hidden">
            {content ?? (
              <span className="flex h-[11px] items-center rounded-[3px] border border-dashed border-current px-[2px] text-[var(--text-muted)] opacity-70">
                <Icon size={7} strokeWidth={2.5} aria-hidden="true" />
              </span>
            )}
          </span>
        </button>
      </Tooltip>
      <button
        type="button"
        onClick={onHide}
        aria-label={`Hide ${label}`}
        title="Hide"
        className="absolute -right-[7px] -top-[6px] z-10 flex h-[11px] w-[11px] items-center justify-center rounded-full bg-[var(--text-muted)] text-[var(--bg-primary)] opacity-0 outline-none transition-opacity hover:bg-[var(--accent-red)] focus-visible:opacity-100 group-hover/item:opacity-100"
      >
        <X size={6} strokeWidth={4} />
      </button>
    </span>
  );
}
