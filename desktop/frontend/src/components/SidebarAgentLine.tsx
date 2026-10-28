import { Archive } from "lucide-react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { ARCHIVE_AGENT_CHORD } from "../agentArchive";
import { AGENT_STATE_LABEL, AGENT_STATE_TONE } from "../agentStatus";
import { chordLabel } from "../keys";
import type { SidebarAgentRow } from "../sidebarAgents";
import { AgentStateIcon, MARK_SLOT } from "./AgentStateIcon";
import { SidebarAgentElapsed } from "./SidebarAgentElapsed";

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

// The archive button takes the clock's place while the row is hovered or
// focused, so the name never shifts to make room for it.
const ARCHIVE_BUTTON_CLASS =
  "pointer-events-none absolute right-1.5 top-1/2 flex h-5 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-secondary)] opacity-0 outline-none transition-opacity hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-cyan)]/60 group-hover/agent:pointer-events-auto group-hover/agent:opacity-100 group-focus-within/agent:pointer-events-auto group-focus-within/agent:opacity-100";
const CLOCK_GIVES_WAY = "group-hover/agent:invisible group-focus-within/agent:invisible";

const stopPointer = (e: PointerEvent) => e.stopPropagation();

interface SidebarAgentLineProps {
  agent: SidebarAgentRow;
  /** Who the tooltip says the agent works for. */
  where: string;
  lead: string;
  active: boolean;
  onOpen: () => void;
  onMenu: (at: { x: number; y: number }) => void;
  /** Absent for a row that can't be archived yet. `viaKeyboard` asks for focus
   *  to move on to the next row. */
  onArchive?: (viaKeyboard: boolean) => void;
}

/** One task under a project: the tab it runs in by name, colored by what it is
 *  doing, a check once it lands, and how long it took. A finish the user has
 *  already opened stays, muted, until it is archived. */
export function SidebarAgentLine({ agent, where, lead, active, onOpen, onMenu, onArchive }: SidebarAgentLineProps) {
  const seen = agent.seenAt !== undefined;
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
    <div className="group/agent relative">
      <button
        data-agent-row={agent.key}
        onClick={onOpen}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        onPointerDown={stopPointer}
        // Padding + mark + gap add up to the project row's own text offset,
        // so a task's name sits directly under the project's.
        className={`flex w-full select-none items-center gap-2 rounded-md py-1 pr-3 text-left text-[12px] outline-none transition-colors ${lead} ${
          active ? ACTIVE_CLASS : RESTING_CLASS
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
        {agent.shared > 0 && (
          <span
            className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]"
            title={`${agent.shared + 1} agents in this tab`}
          >
            +{agent.shared}
          </span>
        )}
        <AgentStateIcon state={agent.state} muted={seen} />
        <span className={onArchive ? CLOCK_GIVES_WAY : undefined}>
          <SidebarAgentElapsed agent={agent} />
        </span>
      </button>
      {onArchive && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onArchive(false);
          }}
          onPointerDown={stopPointer}
          className={ARCHIVE_BUTTON_CLASS}
          aria-label={`Archive ${agent.title}`}
          title={`Archive (${chordLabel(ARCHIVE_AGENT_CHORD)})`}
        >
          <Archive size={12} />
        </button>
      )}
    </div>
  );
}
