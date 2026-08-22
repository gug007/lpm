import { memo } from "react";
import { AGENT_STATE_LABEL, AGENT_STATE_TONE } from "../agentStatus";
import type { SidebarAgentRow } from "../sidebarAgents";
import { AgentStateIcon, MARK_SLOT } from "./AgentStateIcon";
import { SidebarAgentElapsed } from "./SidebarAgentElapsed";

export interface SidebarAgentRowsProps {
  projectName: string;
  /** The project as the user reads it, where that is not the name the rest of
   *  the app routes by — a paired host's projects carry a peer marker. */
  label?: string;
  agents: SidebarAgentRow[];
  /** Set when the project row above sits inside an expanded folder, so its
   *  tasks take the same disclosure step and stay under its name. */
  indented?: boolean;
  /** The terminal on screen right now, or null when this project isn't the one
   *  being looked at. The row that owns it is marked as where the user is. */
  activeTerminalId?: string | null;
  onOpenAgent: (projectName: string, agent: SidebarAgentRow) => void;
}

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

/** What a project has agents on, under its row: one line per task, in the order
 *  their tabs sit in — the tab it runs in by name, colored by what it is doing,
 *  a check once it lands, and how long it took. Each line opens its terminal,
 *  and the one already on screen is marked. */
export const SidebarAgentRows = memo(function SidebarAgentRows({
  projectName,
  label,
  agents,
  indented,
  activeTerminalId,
  onOpenAgent,
}: SidebarAgentRowsProps) {
  return (
    <div className="mb-0.5 flex flex-col">
      {agents.map((agent) => (
        <button
          key={agent.key}
          onClick={() => onOpenAgent(projectName, agent)}
          onPointerDown={(e) => e.stopPropagation()}
          // Padding + mark + gap add up to the project row's own text offset,
          // so a task's name sits directly under the project's.
          className={`flex w-full select-none items-center gap-2 rounded-md py-1 pr-3 text-left text-[12px] outline-none transition-colors ${
            indented ? "pl-[25px]" : "pl-2.5"
          } ${
            agent.terminalId !== null && agent.terminalId === activeTerminalId
              ? ACTIVE_CLASS
              : RESTING_CLASS
          }`}
          title={`${AGENT_STATE_LABEL[agent.state]} — ${agent.provider} in ${label ?? projectName}`}
        >
          <span className={MARK_SLOT} />
          {/* The name is the state: it shimmers while the work runs, pulses
              amber while it waits on the user and turns blue when it lands, the
              same way the project name above and the tab it runs in do. */}
          <span
            className={`min-w-0 flex-1 truncate ${
              agent.state === "idle" ? "" : AGENT_STATE_TONE[agent.state]
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
          <AgentStateIcon state={agent.state} />
          <SidebarAgentElapsed agent={agent} />
        </button>
      ))}
    </div>
  );
});
