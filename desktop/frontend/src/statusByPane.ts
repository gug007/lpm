import { AGENT_STATE_RANK, agentStateOf } from "./agentStatus";
import type { StatusEntry } from "./types";

/** One tab's agents: the one that speaks for it, and the others folded behind
 *  it. `folded` is empty for the ordinary tab, which runs a single agent — but
 *  what it holds still counts, so a problem folded behind a question is not a
 *  problem the app has stopped knowing about. */
export interface PaneAgents {
  entry: StatusEntry;
  folded: StatusEntry[];
}

/** Whether a tab holds a problem — its own or one folded behind it. A question
 *  outranks a problem (AGENT_STATE_RANK), so an agent that errored can end up
 *  behind one that is waiting, and the row it shares would be the only place the
 *  problem was ever said out loud. */
export function paneHoldsError({ entry, folded }: PaneAgents): boolean {
  return [entry, ...folded].some((e) => agentStateOf(e.value) === "error");
}

/** Most urgent first, and within a state the one that entered it most recently. */
export function byUrgency(a: StatusEntry, b: StatusEntry): number {
  return (
    AGENT_STATE_RANK[agentStateOf(a.value)] - AGENT_STATE_RANK[agentStateOf(b.value)] ||
    b.timestamp - a.timestamp
  );
}

/**
 * Fold the agents that share a tab into the first of them, which — given a list
 * sorted so a tab's most urgent agent comes first — is the one whose state the
 * tab should read as.
 *
 * Agents are keyed per session, not per tab (see hooks.rs), because a tab can
 * genuinely hold more than one: a split, or an agent that shelled out to another
 * one, which borrows the tab's pane id and reports under it. Listing those as
 * separate lines names the same tab twice over, so a reader counts agents that,
 * as far as they can tell, do not exist.
 *
 * An entry that names no tab is nobody's duplicate — `lpm set-status` leaves
 * `--pane` optional, and folding those together would merge every scripted
 * status a project has into one — so it always keeps its own place.
 */
export function foldByPane(sorted: StatusEntry[]): PaneAgents[] {
  const out: PaneAgents[] = [];
  const spokenFor = new Map<string, PaneAgents>();
  for (const entry of sorted) {
    const pane = entry.paneID ?? "";
    const already = pane ? spokenFor.get(pane) : undefined;
    if (already) {
      already.folded.push(entry);
      continue;
    }
    const held: PaneAgents = { entry, folded: [] };
    out.push(held);
    if (pane) spokenFor.set(pane, held);
  }
  return out;
}
