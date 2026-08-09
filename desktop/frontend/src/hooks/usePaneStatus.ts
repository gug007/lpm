import { useMemo } from "react";
import {
  STATUS_DONE,
  STATUS_ERROR,
  STATUS_RUNNING,
  STATUS_WAITING,
  type StatusEntry,
} from "../types";
import type { AgentState } from "../agentStatus";

export interface PaneAgentStatus {
  state: Exclude<AgentState, "idle">;
  /** What the reading counts from — null when the app never saw the turn start,
   *  so how long it ran is unknowable and no reading is shown. */
  since: number | null;
  /** When the turn ended. Present only once it has: the reading freezes here
   *  instead of counting on past the work it measures. */
  until?: number;
}

export interface PaneStatus {
  running: Set<string>;
  done: Set<string>;
  waiting: Set<string>;
  error: Set<string>;
  agents: Map<string, PaneAgentStatus>;
}

// Precedence when one pane carries several statuses, matching how the tab
// renders them: the most urgent one wins, and it is the one the chip reads.
const RANK: Record<string, number> = {
  [STATUS_ERROR]: 0,
  [STATUS_WAITING]: 1,
  [STATUS_RUNNING]: 2,
  [STATUS_DONE]: 3,
};

const STATE: Record<string, Exclude<AgentState, "idle">> = {
  [STATUS_ERROR]: "error",
  [STATUS_WAITING]: "needs-you",
  [STATUS_RUNNING]: "working",
  [STATUS_DONE]: "done",
};

// A paired Mac stamps its statuses with its own clock, which can run ahead of
// ours; an unstamped entry would otherwise start in 1970.
function stampOf(stamped: number | undefined, now: number): number | null {
  if (!stamped || stamped < 0) return null;
  return Math.min(stamped, now);
}

/** What one status entry reads as: its state and the span it counts. Shared so
 *  a tab, its composer and the sidebar all measure a turn the same way. Null for
 *  a value no agent reported — there is no turn to time. */
export function agentStatusOf(entry: StatusEntry, now: number): PaneAgentStatus | null {
  const state = STATE[entry.value];
  if (!state) return null;
  const stateSince = stampOf(entry.timestamp, now) ?? now;
  const turnStart = stampOf(entry.turnStart, now);
  // A finished turn reads as how long the work took, held still. Waiting and a
  // problem read as how long they have been true — that is the wait you care
  // about. Working spans a turn's approval pauses, so it counts from when the
  // agent picked the work up rather than restarting after every prompt.
  if (state === "done") {
    return { state, since: turnStart, until: stampOf(entry.endedAt, now) ?? stateSince };
  }
  if (state === "working") return { state, since: turnStart ?? stateSince };
  return { state, since: stateSince };
}

export function derivePaneStatus(
  entries: StatusEntry[] | undefined,
  now: number,
): PaneStatus {
  const running = new Set<string>();
  const done = new Set<string>();
  const waiting = new Set<string>();
  const error = new Set<string>();
  const agents = new Map<string, PaneAgentStatus>();
  const ranks = new Map<string, number>();
  for (const e of entries ?? []) {
    if (!e.paneID) continue;
    if (e.value === STATUS_RUNNING) running.add(e.paneID);
    else if (e.value === STATUS_DONE) done.add(e.paneID);
    else if (e.value === STATUS_WAITING) waiting.add(e.paneID);
    else if (e.value === STATUS_ERROR) error.add(e.paneID);
    else continue;
    if (RANK[e.value] >= (ranks.get(e.paneID) ?? Number.MAX_SAFE_INTEGER)) continue;
    const status = agentStatusOf(e, now);
    if (!status) continue;
    ranks.set(e.paneID, RANK[e.value]);
    agents.set(e.paneID, status);
  }
  return { running, done, waiting, error, agents };
}

/** The one status a terminal shows — null when the agent reports nothing (no
 *  hooks installed, or a plain shell). */
export function paneAgentStatus(
  status: PaneStatus | undefined,
  terminalId: string | null | undefined,
): PaneAgentStatus | null {
  if (!status || !terminalId) return null;
  return status.agents.get(terminalId) ?? null;
}

export function usePaneStatus(entries: StatusEntry[] | undefined): PaneStatus {
  return useMemo(() => derivePaneStatus(entries, Date.now()), [entries]);
}
