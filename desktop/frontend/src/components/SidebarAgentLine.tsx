import { Archive, Settings2 } from "lucide-react";
import { useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { ARCHIVE_AGENT_CHORD } from "../agentArchive";
import { AGENT_STATE_LABEL, AGENT_STATE_TONE } from "../agentStatus";
import { chordLabel } from "../keys";
import type { SidebarAgentRow } from "../sidebarAgents";
import { archiveBlocked } from "../sidebarSeenAgents";
import { AgentStateIcon, MARK_SLOT } from "./AgentStateIcon";
import { SidebarAgentElapsed } from "./SidebarAgentElapsed";
import type { EdgeAgents } from "../sidebarAgentEdges";

// Where the user is, in the only currency the row has left: a wash under it and
// its name at full strength. Every other part of the line is spoken for — the
// name carries the agent's state (and while it works, a gradient the row can't
// recolor), and the end of the line already holds a mark and a clock.
//
// The wash sits between the hover it has to outrank and the `--bg-active` the
// selected project row above it wears, since the two rows touch: at that value
// the pair would read as one block instead of a project and a task inside it.
const ACTIVE_CLASS =
  "bg-[var(--text-primary)]/8 text-[var(--text-primary)] hover:bg-[var(--text-primary)]/14";
const RESTING_CLASS =
  "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";

// While its settings are open, the row stays as it looks under the pointer.
const OPEN_CLASS = "bg-[var(--bg-hover)] text-[var(--text-primary)]";

// The row's buttons take the place of its mark and clock while it is hovered,
// focused or has its settings open, so the name never shifts to make room.
const END_CLASS =
  "pointer-events-none absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-px opacity-0 transition-opacity group-hover/agent:pointer-events-auto group-hover/agent:opacity-100 group-focus-within/agent:pointer-events-auto group-focus-within/agent:opacity-100 group-data-[open=true]/agent:pointer-events-auto group-data-[open=true]/agent:opacity-100";
const END_BUTTON_CLASS =
  "flex h-5 w-5 items-center justify-center rounded-md text-[var(--text-secondary)] outline-none hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-cyan)]/60 aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-[var(--text-secondary)]";
const END_BUTTON_OPEN = "bg-[var(--bg-active)] text-[var(--text-primary)]";
const GIVES_WAY =
  "group-hover/agent:invisible group-focus-within/agent:invisible group-data-[open=true]/agent:invisible";

const stopPointer = (e: PointerEvent) => e.stopPropagation();

interface SidebarAgentLineProps {
  agent: SidebarAgentRow;
  /** Who the tooltip says the agent works for. */
  where: string;
  lead: string;
  active: boolean;
  /** Set when this line should light the end of the list once it scrolls away. */
  edgeAgents?: EdgeAgents;
  onOpen: () => void;
  onMenu: (at: { x: number; y: number }) => void;
  /** Absent for a row that can't be archived yet. `viaKeyboard` asks for focus
   *  to move on to the next row. */
  onArchive?: (viaKeyboard: boolean) => void;
  /** Opens the sidebar's agent settings beside this row. */
  onSettings?: (at: { anchor: HTMLElement; trigger: HTMLElement }) => void;
  settingsOpen?: boolean;
}

/** One task under a project: the tab it runs in by name, colored by what it is
 *  doing, a check once it lands, and how long it took. A finish the user has
 *  already opened stays, muted, until it is archived. */
export function SidebarAgentLine({
  agent,
  where,
  lead,
  active,
  edgeAgents,
  onOpen,
  onMenu,
  onArchive,
  onSettings,
  settingsOpen = false,
}: SidebarAgentLineProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const seen = agent.seenAt !== undefined;
  // With a settings button beside it, Archive shows on every row and says why
  // it waits, so each button keeps one place from row to row.
  const showsArchive = onArchive !== undefined || onSettings !== undefined;
  const givesWay = showsArchive ? GIVES_WAY : undefined;
  const state = `${AGENT_STATE_LABEL[agent.state]}${seen ? ", seen" : ""}`;
  const onKeyDown = (e: KeyboardEvent) => {
    if (!onArchive || (e.key !== "Delete" && e.key !== "Backspace")) return;
    e.preventDefault();
    e.stopPropagation();
    onArchive(true);
  };
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onMenu({ x: e.clientX, y: e.clientY });
  };
  return (
    <div ref={rowRef} className="group/agent relative" data-open={settingsOpen || undefined}>
      <button
        data-agent-row={agent.key}
        data-edge-agent={edgeAgents}
        onClick={onOpen}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        onPointerDown={stopPointer}
        // Padding + mark + gap add up to the project row's own text offset,
        // so a task's name sits directly under the project's.
        className={`flex w-full select-none items-center gap-2 rounded-md py-1 pr-3 text-left text-[12px] outline-none transition-colors ${lead} ${
          active ? ACTIVE_CLASS : settingsOpen ? OPEN_CLASS : RESTING_CLASS
        }`}
        title={`${state} — ${agent.provider} in ${where}`}
      >
        <span className={MARK_SLOT} />
        {/* The name is the state: it shimmers while the work runs, pulses
            amber while it waits on the user and turns blue when it lands, the
            same way the tab it runs in does. Only this row shimmers — the
            project name above leaves the working state to it. Once seen, it
            reads as the rest of the list does. */}
        <span
          className={`min-w-0 flex-1 truncate ${
            seen || agent.state === "idle" ? "" : AGENT_STATE_TONE[agent.state]
          }`}
        >
          {agent.title}
        </span>
        {/* A tab running more than one agent says so rather than quietly
            showing the loudest of them: the line is the tab, and this is how
            many others are in there with it. */}
        {agent.shared.length > 0 && (
          <span
            className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]"
            title={`${agent.shared.length + 1} agents in this tab`}
          >
            +{agent.shared.length}
          </span>
        )}
        <span className={`flex shrink-0 ${givesWay ?? ""}`}>
          <AgentStateIcon state={agent.state} muted={seen} />
        </span>
        {/* Holds a sliver of room even with no clock, so the buttons that
            take its place never sit over the name. */}
        <span className={`min-w-1.5 ${givesWay ?? ""}`}>
          <SidebarAgentElapsed agent={agent} />
        </span>
      </button>
      {showsArchive && (
        <div className={END_CLASS}>
          {onSettings && (
            <button
              type="button"
              data-agent-settings=""
              onClick={(e) => {
                e.stopPropagation();
                if (rowRef.current) onSettings({ anchor: rowRef.current, trigger: e.currentTarget });
              }}
              onPointerDown={stopPointer}
              className={`${END_BUTTON_CLASS} ${settingsOpen ? END_BUTTON_OPEN : ""}`}
              aria-label={`Agent settings for ${agent.title}`}
              aria-haspopup="dialog"
              aria-expanded={settingsOpen}
              title="Agent settings"
            >
              <Settings2 size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onArchive?.(false);
            }}
            onPointerDown={stopPointer}
            className={END_BUTTON_CLASS}
            aria-disabled={onArchive ? undefined : true}
            aria-label={`Archive ${agent.title}`}
            title={onArchive ? `Archive (${chordLabel(ARCHIVE_AGENT_CHORD)})` : archiveBlocked(agent)}
          >
            <Archive size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
