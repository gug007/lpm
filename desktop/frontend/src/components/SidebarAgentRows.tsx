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
  onOpenAgent: (projectName: string, agent: SidebarAgentRow) => void;
}

/** What a project has agents on, under its row: one line per task, in the order
 *  their tabs sit in — the tab it runs in by name, colored by what it is doing,
 *  a check once it lands, and how long it took. Each line opens its terminal. */
export const SidebarAgentRows = memo(function SidebarAgentRows({
  projectName,
  label,
  agents,
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
          className="flex w-full select-none items-center gap-2 rounded-md py-1 pl-2.5 pr-3 text-left text-[12px] text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
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
          <AgentStateIcon state={agent.state} />
          <SidebarAgentElapsed agent={agent} />
        </button>
      ))}
    </div>
  );
});
