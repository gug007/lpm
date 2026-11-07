import { AGENT_STATE_RANK, agentStateOf, type AgentState } from "./agentStatus";
import type { SidebarAgentRow } from "./sidebarAgents";
import type { ProjectInfo } from "./types";

/** What the ends of the project list speak up about. Finished agents stay out,
 *  as they do from a folded folder's rollup: nothing is waiting on them. */
export type EdgeAgentState = Extract<AgentState, "needs-you" | "error" | "working">;

/** Each agent past an end of the list, most urgent first, and how wide the
 *  lines along those ends are. */
export interface AgentsOutOfView {
  above: EdgeAgentState[];
  below: EdgeAgentState[];
  width: number;
}

export const EDGE_AGENT_ATTR = "data-edge-agent";

/** `EDGE_AGENT_ATTR`'s value: one state for each agent a row stands for. */
export type EdgeAgents = string & { readonly __edgeAgents: true };

function isEdgeAgentState(state: AgentState): state is EdgeAgentState {
  return state === "needs-you" || state === "error" || state === "working";
}

function edgeAgentAttr(states: AgentState[]): EdgeAgents | undefined {
  return (states.filter(isEdgeAgentState).join(" ") || undefined) as EdgeAgents | undefined;
}

/** What an agent's own line says, for its tab's other agents too. A row already
 *  looked at waits on nobody, however it ended. */
export function edgeAgentsOfRow(
  agent: Pick<SidebarAgentRow, "state" | "shared" | "seenAt">,
): EdgeAgents | undefined {
  return agent.seenAt === undefined ? edgeAgentAttr([agent.state, ...agent.shared]) : undefined;
}

/** What a row says for projects it folds away, whose agents have no lines of
 *  their own to measure. */
export function edgeAgentsOf(projects: Pick<ProjectInfo, "statusEntries">[]): EdgeAgents | undefined {
  const states = projects.flatMap((project) =>
    (project.statusEntries ?? []).map((entry) => agentStateOf(entry.value)),
  );
  return edgeAgentAttr(states);
}

/** Reads the rows marked with `EDGE_AGENT_ATTR` against the list's own box. A
 *  row counts as gone once less than half of it shows. */
export function agentsOutOfView(list: HTMLElement): AgentsOutOfView {
  const { top, bottom, width } = list.getBoundingClientRect();
  const above: EdgeAgentState[] = [];
  const below: EdgeAgentState[] = [];
  for (const row of list.querySelectorAll<HTMLElement>(`[${EDGE_AGENT_ATTR}]`)) {
    const rect = row.getBoundingClientRect();
    if (rect.height === 0) continue;
    const states = row.getAttribute(EDGE_AGENT_ATTR)!.split(" ") as EdgeAgentState[];
    const middle = rect.top + rect.height / 2;
    if (middle < top) above.push(...states);
    else if (middle > bottom) below.push(...states);
  }
  const byUrgency = (a: EdgeAgentState, b: EdgeAgentState) => AGENT_STATE_RANK[a] - AGENT_STATE_RANK[b];
  return { above: above.sort(byUrgency), below: below.sort(byUrgency), width: Math.round(width) };
}

export interface EdgePiece {
  start: number;
  end: number;
}

/** Where each of `count` agents' pieces sits along a line `width` px long: equal
 *  pieces 2px apart, 6px after every fifth so a long run still reads in fives,
 *  on whole pixels so the gaps stay sharp. Pieces that no longer fit are left
 *  off. lpm Link lays its lines out the same way. */
export function edgeLinePieces(count: number, width: number): EdgePiece[] {
  const gap = 2;
  const wide = gap * 3;
  const gaps = (count - 1) * gap + Math.floor((count - 1) / 5) * (wide - gap);
  const unit = Math.max((width - gaps) / count, gap);
  const pieces: EdgePiece[] = [];
  let position = 0;
  for (let piece = 1; piece <= count; piece++) {
    const start = Math.round(position);
    if (start >= width) break;
    position += unit;
    pieces.push({ start, end: Math.min(Math.round(position), width) });
    position += piece % 5 === 0 ? wide : gap;
  }
  return pieces;
}

function edgeLineMask(pieces: EdgePiece[]): string {
  const stops = pieces.map(({ start, end }) => `transparent ${start}px, #000 ${start}px ${end}px, transparent ${end}px`);
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/** Each state on a line of `agents`, with a mask that shows only its pieces. */
export function edgeLineRuns(agents: EdgeAgentState[], width: number): { tone: EdgeAgentState; mask: string }[] {
  const pieces = edgeLinePieces(agents.length, width);
  return [...new Set(agents)].flatMap((tone) => {
    const shown = pieces.filter((_, i) => agents[i] === tone);
    return shown.length > 0 ? [{ tone, mask: edgeLineMask(shown) }] : [];
  });
}
