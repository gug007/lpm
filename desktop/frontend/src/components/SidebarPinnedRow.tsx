import { computeProjectStatus, rowNameClass } from "../agentStatus";
import type { SidebarAgentRow } from "../sidebarAgents";
import type { ProjectInfo } from "../types";
import type { ProjectWindow } from "../windowFocus";
import { ProjectNameDisplay, projectDisplayName } from "./ProjectNameDisplay";
import { ProjectStatusLight } from "./ProjectStatusLight";
import { RowMenuButton } from "./RowMenuButton";
import { SidebarAgentChevron } from "./SidebarAgentChevron";
import { SidebarAgentSummary } from "./SidebarAgentSummary";
import { SidebarSendLaterMark } from "./SidebarSendLaterMark";
import { SidebarWindowMark } from "./SidebarWindowMark";
import { projectNoteLine } from "./projectNoteLine";
import { WorkStatusMark } from "./WorkStatusMark";
import { DONE_STYLE, ROW_BASE_CLASS, ROW_TWO_LINE_CLASS, rowTrailing } from "./sidebarRowClass";

const MUTED_STYLE = { color: "var(--text-muted)" } as const;

interface SidebarPinnedRowProps {
  project: ProjectInfo;
  parent?: ProjectInfo;
  // The ⌘1–⌘9 chord that opens it, for the first nine.
  shortcut?: string;
  alert: SidebarAgentRow | null;
  opensIn: ProjectWindow;
  // Whether it has agents to list under it, and whether they're listed.
  canExpand: boolean;
  expanded: boolean;
  selected: boolean;
  menuOpen: boolean;
  onSelect: () => void;
  onToggleAgents: () => void;
  onOpenMenu: (x: number, y: number) => void;
}

/** A pinned project at the top of the sidebar, drawn the way its row in the
 *  list is, plus the chord that jumps to it. */
export function SidebarPinnedRow({
  project,
  parent,
  shortcut,
  alert,
  opensIn,
  canExpand,
  expanded,
  selected,
  menuOpen,
  onSelect,
  onToggleAgents,
  onOpenMenu,
}: SidebarPinnedRowProps) {
  const status = computeProjectStatus(project.statusEntries);
  const nameClass = rowNameClass(status, expanded);
  const displayName = projectDisplayName(project, parent);
  const name = <ProjectNameDisplay project={project} parent={parent} />;
  const work = project.workStatus;
  const noteLine = projectNoteLine(project);
  const twoLine = noteLine !== null;
  const controlTop = twoLine ? "top-[14px]" : "top-1/2";
  const trailing = rowTrailing(canExpand, false);

  const identity = (
    <>
      {work && <WorkStatusMark status={work} />}
      <span
        className="truncate"
        title={project.configError || displayName}
        style={project.configError ? MUTED_STYLE : status.isDone ? DONE_STYLE : undefined}
      >
        {nameClass ? <span className={nameClass}>{name}</span> : name}
      </span>
      <SidebarSendLaterMark projectName={project.name} />
      {opensIn !== "here" && <SidebarWindowMark opensIn={opensIn} />}
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
    </>
  );

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenMenu(e.clientX, e.clientY);
        }}
        className={`${twoLine ? ROW_TWO_LINE_CLASS : ROW_BASE_CLASS} ${
          menuOpen ? `${trailing.menu} ring-1 ring-inset ring-[var(--accent-cyan)]/60` : trailing.rest
        } ${
          selected
            ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        }`}
      >
        <span className="flex h-5 shrink-0 items-center">
          <ProjectStatusLight project={project} />
        </span>
        {twoLine ? (
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-3">{identity}</span>
            <span className="mt-px truncate text-[10px] leading-[13px] text-[var(--text-muted)]">
              {noteLine}
            </span>
          </span>
        ) : (
          identity
        )}
      </button>
      {canExpand && (
        <span
          className={`absolute ${controlTop} -translate-y-1/2 transition-[right] ${
            menuOpen ? "right-9" : "right-2 group-hover:right-9"
          }`}
        >
          <SidebarAgentChevron expanded={expanded} label={displayName} onToggle={onToggleAgents} />
        </span>
      )}
      <RowMenuButton open={menuOpen} label={displayName} placement={controlTop} onOpen={onOpenMenu} />
    </div>
  );
}
