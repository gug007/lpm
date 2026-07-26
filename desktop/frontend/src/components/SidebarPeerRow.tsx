import type { ReactNode } from "react";
import { StatusDot } from "./StatusDot";
import { MoreVerticalIcon } from "./icons";
import {
  type ProjectInfo,
  STATUS_RUNNING,
  STATUS_DONE,
  STATUS_WAITING,
  STATUS_ERROR,
} from "../types";

const ROW_BASE_CLASS =
  "flex w-full select-none items-center gap-3 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors";

function statusClass(project: ProjectInfo): string | null {
  const entries = project.statusEntries ?? [];
  const has = (v: string) => entries.some((e) => e.value === v);
  if (has(STATUS_ERROR)) return "text-red-400";
  if (has(STATUS_WAITING)) return "sidebar-waiting";
  if (has(STATUS_RUNNING)) return "sidebar-shimmer";
  if (has(STATUS_DONE)) return null;
  return null;
}

// One row in a paired Mac's section. It opens whichever project it addresses —
// the Mac's own project, or the local copy of one when that Mac is away — and
// carries a trailing mark for rows that have a synced copy here.
export function SidebarPeerRow({
  project,
  label,
  selected,
  isContextTarget,
  mark,
  onSelect,
  onContextMenu,
}: {
  project: ProjectInfo;
  label: string;
  selected: boolean;
  isContextTarget: boolean;
  mark?: ReactNode;
  onSelect: () => void;
  onContextMenu: (x: number, y: number) => void;
}) {
  const cls = statusClass(project);
  return (
    <div className="group/row relative">
      <button
        onClick={onSelect}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e.clientX, e.clientY);
        }}
        className={`${ROW_BASE_CLASS} ${mark ? "pr-7" : ""} ${
          isContextTarget
            ? "pr-9 ring-1 ring-inset ring-[var(--accent-cyan)]/60"
            : mark
              ? "group-hover/row:pr-14"
              : "group-hover/row:pr-9"
        } ${
          selected
            ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        }`}
      >
        <StatusDot running={project.running} />
        <span className="truncate" title={label}>
          {cls ? <span className={cls}>{label}</span> : label}
        </span>
      </button>
      {/* Sits at the row's edge and steps aside for the ⋮ on hover, so the name
          keeps its width instead of paying for the mark all the time. */}
      {mark && (
        <span
          className={`absolute top-1/2 flex -translate-y-1/2 items-center transition-[right] ${
            isContextTarget ? "right-9" : "right-3 group-hover/row:right-9"
          }`}
        >
          {mark}
        </span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          // useOutsideClick's mousedown already closed the menu — skip the reopen so the second click toggles off.
          if (isContextTarget) return;
          const rect = e.currentTarget.getBoundingClientRect();
          onContextMenu(rect.left, rect.bottom + 4);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={`absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[var(--text-muted)] transition-opacity hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
          isContextTarget
            ? "opacity-100"
            : "pointer-events-none opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100"
        }`}
        title="More options"
        aria-label={`More options for ${label}`}
      >
        <MoreVerticalIcon />
      </button>
    </div>
  );
}
