import { computeProjectStatus, rowNameClass } from "../agentStatus";
import type { SidebarAgentRow } from "../sidebarAgents";
import type { ProjectInfo } from "../types";
import { ProjectNameDisplay, projectDisplayName } from "./ProjectNameDisplay";
import { ProjectStatusLight } from "./ProjectStatusLight";
import { RowMenuButton } from "./RowMenuButton";
import { SidebarAgentSummary } from "./SidebarAgentSummary";
import { DONE_STYLE, ROW_BASE_CLASS, rowTrailing } from "./sidebarRowClass";

const TRAILING = rowTrailing(false, false);

interface SidebarPinnedRowProps {
  project: ProjectInfo;
  parent?: ProjectInfo;
  // The ⌘1–⌘9 chord that opens it, for the first nine.
  shortcut?: string;
  alert: SidebarAgentRow | null;
  selected: boolean;
  menuOpen: boolean;
  onSelect: () => void;
  onOpenMenu: (x: number, y: number) => void;
}

/** A pinned project at the top of the sidebar: a way back to it, so it carries
 *  what says whether to go there (its light, its agents' state) and leaves
 *  the agents' own rows to its place in the list. */
export function SidebarPinnedRow({
  project,
  parent,
  shortcut,
  alert,
  selected,
  menuOpen,
  onSelect,
  onOpenMenu,
}: SidebarPinnedRowProps) {
  const status = computeProjectStatus(project.statusEntries);
  const nameClass = rowNameClass(status, false);
  const displayName = projectDisplayName(project, parent);
  const name = <ProjectNameDisplay project={project} parent={parent} />;

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenMenu(e.clientX, e.clientY);
        }}
        className={`${ROW_BASE_CLASS} ${menuOpen ? `${TRAILING.menu} ring-1 ring-inset ring-[var(--accent-cyan)]/60` : TRAILING.rest} ${
          selected
            ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        }`}
      >
        <span className="flex h-5 shrink-0 items-center">
          <ProjectStatusLight project={project} />
        </span>
        <span className="truncate" title={displayName} style={status.isDone ? DONE_STYLE : undefined}>
          {nameClass ? <span className={nameClass}>{name}</span> : name}
        </span>
        {alert && <SidebarAgentSummary agent={alert} />}
        {shortcut && (
          <span
            className={`ml-auto shrink-0 pl-2 text-[11px] tabular-nums text-[var(--text-muted)] ${
              menuOpen ? "invisible" : "group-hover:invisible"
            }`}
          >
            {shortcut}
          </span>
        )}
      </button>
      <RowMenuButton open={menuOpen} label={displayName} placement="top-1/2" onOpen={onOpenMenu} />
    </div>
  );
}
