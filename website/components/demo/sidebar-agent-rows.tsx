"use client";

import { AlertCircle, Check } from "lucide-react";
import type { AgentStatus } from "./agent-terminal";
import type { AgentTabState } from "./project-view";
import { FOCUS_RING } from "./ui";

export type SidebarAgentRow = AgentTabState & { key: string };

export function sidebarAgentRows(
  tabs: Record<string, AgentTabState> | undefined,
): SidebarAgentRow[] {
  return Object.entries(tabs ?? {}).map(([key, tab]) => ({ key, ...tab }));
}

// One mark's worth of space, held whether or not a mark sits in it, so the
// names stay in one column. Its 14px plus the row's padding and gap add up to
// the project row's own text offset, so a task's name sits under the project's.
const MARK_SLOT = "h-3.5 w-3.5 shrink-0";

const NAME_CLASS: Record<AgentStatus, string> = {
  running: "sidebar-shimmer",
  waiting: "sidebar-waiting",
  done: "text-[#60a5fa]",
  error: "text-[#f87171]",
};

const STATUS_WORD: Record<AgentStatus, string> = {
  running: "Working",
  waiting: "Needs you",
  done: "Done",
  error: "Problem",
};

/** What a project has agents on, under its row: one line per terminal tab,
 *  named by the tab and colored by what the agent in it is doing. */
export function SidebarAgentRows({
  agents,
  onOpen,
}: {
  agents: SidebarAgentRow[];
  onOpen: () => void;
}) {
  return (
    <div className="mb-0.5 flex flex-col">
      {agents.map((agent) => (
        <button
          key={agent.key}
          type="button"
          onClick={onOpen}
          title={`${agent.label} — ${STATUS_WORD[agent.status]}`}
          className={`flex w-full select-none items-center gap-2 rounded-md py-1 pl-2.5 pr-3 text-left text-[12px] text-[#919191] outline-none transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] ${FOCUS_RING}`}
        >
          <span className={MARK_SLOT} />
          <span
            className={`min-w-0 flex-1 truncate ${NAME_CLASS[agent.status]}`}
          >
            {agent.label}
          </span>
          {agent.status === "done" ? (
            <span className={`${MARK_SLOT} text-[#60a5fa]`}>
              <Check className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
          ) : agent.status === "error" ? (
            <span className={`${MARK_SLOT} text-[#f87171]`}>
              <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
          ) : (
            <span className={MARK_SLOT} />
          )}
        </button>
      ))}
    </div>
  );
}
