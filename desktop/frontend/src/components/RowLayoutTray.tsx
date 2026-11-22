import { useDroppable } from "@dnd-kit/core";
import { ROW_DETAIL_GROUPS } from "../sidebarRowDetails";
import type { RowDetail } from "../sidebarRowLayout";
import { TRAY_ZONE } from "../rowLayoutDnd";
import { RowLayoutChip } from "./RowLayoutChip";

interface RowLayoutTrayProps {
  details: RowDetail[];
  valueOf: (detail: RowDetail) => string | undefined;
  dragging: boolean;
  over: boolean;
  picked: RowDetail | null;
  // The picked detail sits on a line, so the tray can take it back.
  canHidePicked: boolean;
  onPick: (detail: RowDetail) => void;
  onHidePicked: () => void;
}

/** The details not on the row, by group: drag one onto a line to show it. */
export function RowLayoutTray({
  details,
  valueOf,
  dragging,
  over,
  picked,
  canHidePicked,
  onPick,
  onHidePicked,
}: RowLayoutTrayProps) {
  const { setNodeRef } = useDroppable({ id: TRAY_ZONE });
  const groups = ROW_DETAIL_GROUPS.map((g) => ({ ...g, details: g.details.filter((d) => details.includes(d)) })).filter(
    (g) => g.details.length > 0,
  );

  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label="Hidden details"
      className={`rounded-xl border px-3.5 py-1 transition-[border-color,background-color] ${
        over
          ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/8"
          : dragging
            ? "border-dashed border-[var(--accent-cyan)]/55 bg-[var(--bg-secondary)]"
            : "border-[var(--border)] bg-[var(--bg-secondary)]"
      }`}
    >
      {groups.map((g) => (
        <div
          key={g.label}
          className="flex min-h-[42px] items-center gap-3 border-b border-[var(--border)]/60 last:border-b-0"
        >
          <span className="w-16 shrink-0 text-[11px] font-semibold text-[var(--text-muted)]">{g.label}</span>
          <div className="flex flex-wrap gap-1.5 py-1.5">
            {g.details.map((detail) => (
              <RowLayoutChip
                key={detail}
                detail={detail}
                value={valueOf(detail)}
                picked={picked === detail}
                onPick={() => onPick(detail)}
              />
            ))}
          </div>
        </div>
      ))}
      {groups.length === 0 && (
        <p className="flex min-h-[42px] items-center text-[12px] text-[var(--text-muted)]">
          Every detail is on the row. Drag one back here to hide it.
        </p>
      )}
      {canHidePicked && (
        <div className="flex justify-end pb-2 pt-1">
          <button
            type="button"
            onClick={onHidePicked}
            className="h-6 rounded-md border border-dashed border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/8 px-2 text-[11.5px] font-semibold text-[var(--accent-cyan-text)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-cyan)]"
          >
            Hide it
          </button>
        </div>
      )}
    </div>
  );
}
