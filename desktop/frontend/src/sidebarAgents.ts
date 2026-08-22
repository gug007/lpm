import { agentStateOf, providerMeta, statusProvider, type AgentState } from "./agentStatus";
import { agentStatusOf } from "./hooks/usePaneStatus";
import { byUrgency, foldByPane, paneHoldsError } from "./statusByPane";
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
  /** How many further agents report on this row's tab, folded into it. A tab
   *  holds one agent, so this is zero — unless a split runs two in one tab, or
   *  an agent launched another that reports under the tab it borrowed. */
  shared: number;
  /** Whether this tab holds a problem, its own or one folded behind it. A
   *  question outranks a problem, so `state` alone would lose an error sitting
   *  behind a wait — and the project row above speaks only for problems. */
  holdsError: boolean;
}

/** Every agent a project has going, in the order the sidebar lists them: the
 *  order their tabs sit in above, so the list reads as the tab strip does.
 *  Agents in a tab this window can't name — a project it never opened — have no
 *  place in that order and trail behind, most urgent first.
 *
 *  One line per tab, not per reporting agent. Several agents can report on one
 *  tab — a split running two, or one that shelled out to another, which borrows
 *  the tab's pane id and would otherwise open a second line under the same name.
 *  The most urgent of them speaks for the tab and the rest are counted on it, so
 *  a tab genuinely running two is still readable as two. An agent reporting
 *  against no tab at all (`lpm set-status` leaves `--pane` optional) is nobody's
 *  duplicate and always keeps its own line. */
export function projectAgentRows(
  project: ProjectInfo,
  now: number,
  tabTitles: Record<string, string> = {},
): SidebarAgentRow[] {
  // Keyed in tab order by whoever publishes them (see store/terminalTitles).
  const tabOrder = Object.keys(tabTitles);
  const tabRank = (entry: StatusEntry) => {
    const idx = tabOrder.indexOf(entry.paneID ?? "");
    return idx < 0 ? tabOrder.length : idx;
  };
  // Sorted this way, one tab's agents are adjacent and its most urgent comes
  // first, which is what `foldByPane` folds the rest into.
  const sorted = [...(project.statusEntries ?? [])].sort(
    (a, b) => tabRank(a) - tabRank(b) || byUrgency(a, b),
  );
  return foldByPane(sorted).map((held) => {
    const { entry, folded } = held;
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
      shared: folded.length,
      holdsError: paneHoldsError(held),
    };
  });
}

/** The one agent the project row itself speaks for — only a problem gets a word
 *  up there. A wait shows in the row's amber name and in the rows underneath. */
export function sidebarProjectAlert(agents: SidebarAgentRow[]): SidebarAgentRow | null {
  // Not `agents[0]`: the rows sit in tab order, so the first of them says
  // nothing about which agent needs a word up here. And not `state`, which a
  // wait on the same tab outranks — a problem still gets its word.
  return agents.find((agent) => agent.holdsError) ?? null;
}
