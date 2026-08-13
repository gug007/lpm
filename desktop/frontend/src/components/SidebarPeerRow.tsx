import { useCallback, useMemo, type ReactNode } from "react";
import { StatusDot, dotKind } from "./StatusDot";
import { MoreVerticalIcon } from "./icons";
import { type ProjectInfo } from "../types";
import { computeProjectStatus } from "../agentStatus";
import { projectAgentRows, sidebarProjectAlert, type SidebarAgentRow } from "../sidebarAgents";
import { useCollapsedAgents } from "../sidebarCollapsed";
import { useAppStore } from "../store/app";
import { useTerminalTitles } from "../store/terminalTitles";
import { SidebarAgentChevron } from "./SidebarAgentChevron";
import { SidebarAgentRows } from "./SidebarAgentRows";
import { SidebarAgentSummary } from "./SidebarAgentSummary";

const ROW_BASE_CLASS =
  "flex w-full select-none items-center gap-3 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors";

// Room at the row's end for what parks there: the ⋮ once the row is hovered or
// holding the menu, the chevron whenever the project has agents, and the mark a
// row with a synced copy carries. Spelled out per case rather than composed —
// Tailwind only emits the classes it can read here.
const TRAILING_PAD = {
  both: { rest: "pr-14 group-hover/row:pr-20", menu: "pr-20" },
  chevron: { rest: "pr-8 group-hover/row:pr-14", menu: "pr-14" },
  mark: { rest: "pr-7 group-hover/row:pr-14", menu: "pr-9" },
  none: { rest: "group-hover/row:pr-9", menu: "pr-9" },
} as const;

// One row in a paired Mac's section. It opens whichever project it addresses —
// the Mac's own project, or the local copy of one when that Mac is away — and
// carries a trailing mark for rows that have a synced copy here. Like a local
// row, it lists the project's agents underneath: the host's statuses arrive with
// their pane ids peer-marked (see peer/router.ts), so each line names the tab it
// belongs to and opens it.
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
  const cls = computeProjectStatus(project.statusEntries).className;
  // Only a project this window has open publishes its tab names; the rest fall
  // back to naming their agent.
  const titles = useTerminalTitles((s) => s.byProject[project.name]);
  const focusProjectTerminal = useAppStore((s) => s.focusProjectTerminal);
  const collapsedAgents = useCollapsedAgents((s) => s.collapsed);
  const toggleExpanded = useCollapsedAgents((s) => s.toggle);

  const agents = useMemo(() => projectAgentRows(project, Date.now(), titles), [project, titles]);
  const alert = sidebarProjectAlert(agents);
  const canExpand = agents.length > 0;
  const isExpanded = canExpand && !collapsedAgents.has(project.name);

  // An agent row opens the terminal the agent is in — a mirrored one here, which
  // takes the same route a local terminal does. A status whose pane the host
  // never named can still only take you to the project.
  const openAgent = useCallback(
    (projectName: string, agent: SidebarAgentRow) => {
      if (agent.terminalId) focusProjectTerminal(projectName, agent.terminalId);
      else onSelect();
    },
    [focusProjectTerminal, onSelect],
  );

  const trailingPad =
    TRAILING_PAD[canExpand ? (mark ? "both" : "chevron") : mark ? "mark" : "none"][
      isContextTarget ? "menu" : "rest"
    ];

  return (
    <>
      <div className="group/row relative">
        <button
          onClick={onSelect}
          onContextMenu={(e) => {
            e.preventDefault();
            onContextMenu(e.clientX, e.clientY);
          }}
          className={`${ROW_BASE_CLASS} ${trailingPad} ${
            isContextTarget ? "ring-1 ring-inset ring-[var(--accent-cyan)]/60" : ""
          } ${
            selected
              ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          }`}
        >
          <StatusDot running={project.running} kind={dotKind(project)} />
          <span className="truncate" title={label}>
            {cls ? <span className={cls}>{label}</span> : label}
          </span>
          {alert && <SidebarAgentSummary agent={alert} />}
        </button>
        {/* Sits at the row's edge and steps aside for the ⋮ on hover, so the name
            keeps its width instead of paying for these all the time. */}
        {(mark || canExpand) && (
          <span
            className={`absolute top-1/2 flex -translate-y-1/2 items-center gap-1 transition-[right] ${
              isContextTarget ? "right-9" : "right-2 group-hover/row:right-9"
            }`}
          >
            {mark}
            {canExpand && (
              <SidebarAgentChevron
                expanded={isExpanded}
                label={label}
                onToggle={() => toggleExpanded(project.name)}
              />
            )}
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
      {isExpanded && (
        <SidebarAgentRows
          projectName={project.name}
          label={label}
          agents={agents}
          onOpenAgent={openAgent}
        />
      )}
    </>
  );
}
