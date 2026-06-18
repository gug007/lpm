import { ChevronDownIcon, ChevronRightIcon, MoreVerticalIcon } from "./icons";
import type { ProjectGroup } from "../types";

interface SidebarGroupRowProps {
  group: ProjectGroup;
  collapsed: boolean;
  selectMode: boolean;
  isContextTarget: boolean;
  onToggle: () => void;
  onMore: (x: number, y: number) => void;
}

export function SidebarGroupRow({
  group,
  collapsed,
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
        className={`flex w-full select-none items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none transition-colors text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
          isContextTarget ? "pr-9 ring-1 ring-inset ring-[var(--accent-cyan)]/60" : "group-hover/folder:pr-9"
        }`}
      >
        <span className="shrink-0 text-[var(--text-muted)]">
          {collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
        </span>
        <span className="truncate font-medium">{group.name}</span>
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
