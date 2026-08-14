import { ChevronRightIcon, MoreVerticalIcon } from "./icons";
import type { ProjectGroup } from "../types";

/** The most urgent state among a collapsed folder's hidden members, worn by
 *  the header's count so the fold doesn't silence them. */
export type GroupTone = "error" | "waiting" | "running";

const TONE_CLASS: Record<GroupTone, string> = {
  error: "text-[var(--accent-red-text)]",
  waiting: "sidebar-waiting",
  running: "text-[var(--accent-green-text)]",
};

interface SidebarGroupRowProps {
  group: ProjectGroup;
  collapsed: boolean;
  count: number;
  tone: GroupTone | null;
  containsSelected: boolean;
  selectMode: boolean;
  isContextTarget: boolean;
  onToggle: () => void;
  onMore: (x: number, y: number) => void;
}

export function SidebarGroupRow({
  group,
  collapsed,
  count,
  tone,
  containsSelected,
  selectMode,
  isContextTarget,
  onToggle,
  onMore,
}: SidebarGroupRowProps) {
  return (
    <div className="group/folder relative">
      <button
        onClick={onToggle}
        onContextMenu={(e) => {
          e.preventDefault();
          onMore(e.clientX, e.clientY);
        }}
        className={`flex w-full select-none items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none transition-colors ${
          containsSelected
            ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        } ${
          isContextTarget ? "pr-9 ring-1 ring-inset ring-[var(--accent-cyan)]/60" : "group-hover/folder:pr-9"
        }`}
      >
        <span
          className={`relative z-20 shrink-0 text-[var(--text-muted)] transition-transform duration-150 ${
            collapsed ? "" : "rotate-90"
          }`}
        >
          <ChevronRightIcon />
        </span>
        <span className="truncate font-medium">{group.name}</span>
        {count > 0 && (
          <span
            className={`ml-auto shrink-0 text-[11px] tabular-nums transition-opacity ${
              isContextTarget ? "opacity-0" : "group-hover/folder:opacity-0"
            }`}
          >
            {/* The pulse animates opacity, which would beat the hover fade on the
                same element — the fade lives on the wrapper above instead. */}
            <span className={tone ? TONE_CLASS[tone] : "text-[var(--text-muted)]"}>
              {count}
            </span>
          </span>
        )}
      </button>
      {!selectMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isContextTarget) return;
            const rect = e.currentTarget.getBoundingClientRect();
            onMore(rect.left, rect.bottom + 4);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[var(--text-muted)] transition-opacity hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
            isContextTarget
              ? "opacity-100"
              : "pointer-events-none opacity-0 group-hover/folder:pointer-events-auto group-hover/folder:opacity-100"
          }`}
          title="Folder options"
          aria-label={`Options for folder ${group.name}`}
        >
          <MoreVerticalIcon />
        </button>
      )}
    </div>
  );
}
