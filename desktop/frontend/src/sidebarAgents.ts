import {
  AGENT_STATE_RANK,
  agentStateOf,
  providerMeta,
  statusProvider,
  type AgentState,
} from "./agentStatus";
import { agentStatusOf } from "./hooks/usePaneStatus";
import type { ProjectInfo, StatusEntry } from "./types";

/** One agent of a project, as the sidebar lists it under the project's row. */
export interface SidebarAgentRow {
  key: string;
  state: AgentState;
  /** What the agent's terminal tab is called. Falls back to the agent's own
   *  name for a project this window has never opened, which is the only place
   *  tab names come from. */
  title: string;
  /** "Claude Code", "Codex" — whichever agent reported the status. */
  provider: string;
  terminalId: string | null;
  /** Millis: what the row's reading counts from — the turn's start for work
   *  running or finished, the state's own start for a wait. Null when the turn
   *  was never seen starting, so how long it ran is unknowable. */
  since: number | null;
  /** Millis: set once the turn ended, freezing the reading at how long the work
   *  took instead of counting on past it. */
  until?: number;
}

/** Most urgent first, and within a state the one that entered it most recently. */
function byUrgency(a: StatusEntry, b: StatusEntry): number {
  return (
    AGENT_STATE_RANK[agentStateOf(a.value)] - AGENT_STATE_RANK[agentStateOf(b.value)] ||
    b.timestamp - a.timestamp
  );
}

/** Every agent a project has going, in the order the sidebar lists them. */
export function projectAgentRows(
  project: ProjectInfo,
  now: number,
  tabTitles: Record<string, string> = {},
): SidebarAgentRow[] {
  return [...(project.statusEntries ?? [])].sort(byUrgency).map((entry) => {
    const provider = providerMeta(statusProvider(entry.key)).label;
    // Null for a status nothing acts on — an idle agent has no turn to time.
    const turn = agentStatusOf(entry, now);
    return {
      key: entry.key,
      state: agentStateOf(entry.value),
      title: tabTitles[entry.paneID ?? ""] || provider,
      provider,
      terminalId: entry.paneID || null,
      since: turn?.since ?? null,
      until: turn?.until,
    };
  });
}

/** The one agent the project row itself speaks for — only a state the user has
 *  to act on gets a word up there; the rest is in the rows underneath. */
export function sidebarProjectAlert(agents: SidebarAgentRow[]): SidebarAgentRow | null {
  const first = agents[0];
  return first && (first.state === "needs-you" || first.state === "error") ? first : null;
}
