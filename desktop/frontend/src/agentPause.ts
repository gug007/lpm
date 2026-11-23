import { shortDuration } from "./jobsFormat";
import { STATUS_RUNNING, type StatusEntry } from "./types";

/** A turn that stopped beside background shells: the agent sits idle until one
 *  of them ends and wakes it. Underneath, its status still says running. */
export interface AgentPause {
  /** Millis: when the turn stopped. */
  since: number;
  /** What each shell is doing, in the agent's words. */
  shells: string[];
}

export const PAUSED_LABEL = "Paused";

/** Working's violet, held still: the same work, waiting. */
export const PAUSED_TONE = "text-[var(--accent-violet-text)]";

export function pauseOf(entry: StatusEntry): AgentPause | undefined {
  if (entry.value !== STATUS_RUNNING || !entry.pausedAt || !entry.shells?.length) return undefined;
  return { since: entry.pausedAt, shells: entry.shells };
}

/** "1 shell", "2 shells" — the words Claude's own screen uses. */
export function shellsLabel(pause: AgentPause): string {
  const count = pause.shells.length;
  return count === 1 ? "1 shell" : `${count} shells`;
}

/** What a paused row's tooltip says: how long the turn worked, what it left
 *  running, and that nobody has to restart it. */
export function pauseTooltip(pause: AgentPause, turnStart: number | null, who: string, agent: string): string {
  const worked = turnStart === null ? "" : ` after ${shortDuration(pause.since - turnStart)}`;
  const one = pause.shells.length === 1;
  return [
    `${PAUSED_LABEL}${worked} — ${who}`,
    `In the background: ${pause.shells.join(" · ")}`,
    `${agent} carries on when ${one ? "it" : "one of them"} ends.`,
  ].join("\n");
}
