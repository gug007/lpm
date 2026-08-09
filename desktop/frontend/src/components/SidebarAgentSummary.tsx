import { AGENT_STATE_LABEL, AGENT_STATE_TONE } from "../agentStatus";
import type { SidebarAgentRow } from "../sidebarAgents";

/** The word a project row carries when one of its agents wants the user. What
 *  the rest of them are doing is in the rows underneath — see
 *  `sidebarProjectAlert` for which agent gets to speak here. */
export function SidebarAgentSummary({ agent }: { agent: SidebarAgentRow }) {
  return (
    <span className={`shrink-0 text-[11px] font-medium ${AGENT_STATE_TONE[agent.state]}`}>
      {AGENT_STATE_LABEL[agent.state]}
    </span>
  );
}
