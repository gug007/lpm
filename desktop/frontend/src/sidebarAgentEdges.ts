import { AGENT_STATE_RANK, agentStateOf, type AgentState } from "./agentStatus";
import type { SidebarAgentRow } from "./sidebarAgents";
import type { ProjectInfo } from "./types";

/** What the ends of the project list speak up about. Finished agents stay out,
 *  as they do from a folded folder's rollup: nothing is waiting on them. */
export type EdgeAgentState = Extract<AgentState, "needs-you" | "error" | "working">;

/** The most urgent agent past each end of the list. */
export interface AgentsOutOfView {
  above?: EdgeAgentState;
  below?: EdgeAgentState;
}

export const EDGE_AGENT_ATTR = "data-edge-agent";

function isEdgeAgentState(state: AgentState): state is EdgeAgentState {
  return state === "needs-you" || state === "error" || state === "working";
}

/** What an agent's own line says. A row already looked at waits on nobody,
 *  however it ended. */
export function edgeAgentOfRow(agent: Pick<SidebarAgentRow, "state" | "seenAt">): EdgeAgentState | undefined {
  return agent.seenAt === undefined && isEdgeAgentState(agent.state) ? agent.state : undefined;
}

function moreUrgent(a: EdgeAgentState | undefined, b: EdgeAgentState): EdgeAgentState {
  return a && AGENT_STATE_RANK[a] <= AGENT_STATE_RANK[b] ? a : b;
}

/** What a row says for projects it folds away, whose agents have no lines of
 *  their own to measure. */
export function edgeAgentState(
  projects: Pick<ProjectInfo, "statusEntries">[],
): EdgeAgentState | undefined {
  let found: EdgeAgentState | undefined;
  for (const project of projects) {
    for (const entry of project.statusEntries ?? []) {
      const state = agentStateOf(entry.value);
      if (isEdgeAgentState(state)) found = moreUrgent(found, state);
    }
  }
  return found;
}

/** Reads the rows marked with `EDGE_AGENT_ATTR` against the list's own box. A
 *  row counts as gone once less than half of it shows. */
export function agentsOutOfView(list: HTMLElement): AgentsOutOfView {
  const { top, bottom } = list.getBoundingClientRect();
  const edges: AgentsOutOfView = {};
  for (const row of list.querySelectorAll<HTMLElement>(`[${EDGE_AGENT_ATTR}]`)) {
    const rect = row.getBoundingClientRect();
    if (rect.height === 0) continue;
    const state = row.getAttribute(EDGE_AGENT_ATTR) as EdgeAgentState;
    const middle = rect.top + rect.height / 2;
    if (middle < top) edges.above = moreUrgent(edges.above, state);
    else if (middle > bottom) edges.below = moreUrgent(edges.below, state);
  }
  return edges;
}
