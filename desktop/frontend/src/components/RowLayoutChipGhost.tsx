import { ROW_DETAIL_INFO } from "../sidebarRowDetails";
import type { RowDetail } from "../sidebarRowLayout";
import { ROW_DETAIL_LOOK } from "./rowDetailLook";

/** The chip under the pointer while a detail is dragged. */
export function RowLayoutChipGhost({ detail }: { detail: RowDetail }) {
  const { Icon, color } = ROW_DETAIL_LOOK[detail];
  return (
    <span className="inline-flex h-7 -rotate-2 items-center gap-1.5 rounded-md border border-[var(--accent-cyan)] bg-[var(--bg-primary)] px-2 text-[12px] font-medium text-[var(--text-primary)] shadow-lg">
      <Icon size={12} style={{ color }} aria-hidden="true" />
      {ROW_DETAIL_INFO[detail].label}
    </span>
  );
}
