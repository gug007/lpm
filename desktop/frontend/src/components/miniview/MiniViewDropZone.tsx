import { useDroppable } from "@dnd-kit/core";
import { PictureInPicture2 } from "lucide-react";
import { MINI_VIEW_DROP_ID } from "../tabDropIds";

/** While a terminal tab is dragged: the corner a drop keeps it in a mini view
 *  from, where the mini views sit. */
export function MiniViewDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: MINI_VIEW_DROP_ID });
  return (
    <div
      ref={setNodeRef}
      className={`fixed bottom-[148px] right-4 z-[40] flex h-[110px] w-[220px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-[12px] font-medium transition-colors ${
        isOver
          ? "border-[var(--accent-cyan)] bg-[color-mix(in_srgb,var(--accent-cyan)_16%,var(--bg-secondary))] text-[var(--text-primary)]"
          : "border-[color-mix(in_srgb,var(--accent-cyan)_45%,transparent)] bg-[color-mix(in_srgb,var(--bg-secondary)_85%,transparent)] text-[var(--text-muted)]"
      }`}
    >
      <PictureInPicture2 size={18} strokeWidth={1.6} />
      Keep in a mini view
    </div>
  );
}
