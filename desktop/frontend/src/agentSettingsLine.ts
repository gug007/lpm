import { AGENT_STATE_LABEL } from "./agentStatus";
import { archiveAfterMillis, describeArchiveAfter, type ArchiveAfter } from "./archiveAfter";
import type { SidebarAgentRow } from "./sidebarAgents";

/** The sidebar settings that decide how long a finished agent's row stays. */
export interface SeenAgentRules {
  keep: boolean;
  /** Null for never. */
  after: ArchiveAfter | null;
}

const MINUTE = 60_000;

// Time since rounds down and time left rounds up, so the two never add up to
// less than the whole: seen 12m ago, archived in 48m.
function span(ms: number, round: (n: number) => number = Math.floor): string {
  const mins = Math.max(1, round(ms / MINUTE));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return mins % 60 ? `${hours}h ${mins % 60}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`;
}

/** What the sidebar settings mean for one agent row, in its own terms:
 *  "Seen 12m ago · Archived in 48m". */
export function agentSettingsLine(
  row: Pick<SidebarAgentRow, "state" | "seenAt">,
  rules: SeenAgentRules,
  now: number,
): string {
  const state = AGENT_STATE_LABEL[row.state];
  if (row.state === "working") return `${state} · Archive waits until the turn ends`;
  if (row.state === "needs-you") return `${state} · Archive waits for your answer`;
  if (row.state === "idle") return state;

  if (row.seenAt === undefined) {
    if (!rules.keep) return `${state} · Not opened yet · Opening it removes the row`;
    if (!rules.after) return `${state} · Not opened yet · Once opened, it stays until you archive it`;
    return `${state} · Not opened yet · Once opened, it's archived ${describeArchiveAfter(rules.after)} later`;
  }

  const since = now - row.seenAt;
  const seen = since < MINUTE ? "Seen just now" : `Seen ${span(since)} ago`;
  if (!rules.keep) return `${seen} · Leaving the sidebar`;
  if (!rules.after) return `${seen} · Stays until you archive it`;
  const left = archiveAfterMillis(rules.after) - since;
  return left < MINUTE ? `${seen} · Archived within a minute` : `${seen} · Archived in ${span(left, Math.ceil)}`;
}
