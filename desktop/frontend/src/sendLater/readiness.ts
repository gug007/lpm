import type { AgentState } from "../agentStatus";
import type { SendLaterHold } from "../store/sendLater";

// How long a terminal that just took a prompt is left alone: its agent reports
// that it started only once its own hook runs, and until then it looks ready.
export const SENT_SETTLE_MS = 20_000;
// An agent interrupted mid-turn keeps reporting it is working. After this long
// with no output at all it is taken to be idle.
export const STALE_WORKING_MS = 2 * 60_000;
const SWITCH_RETRY_MS = 2_000;

export interface ReadinessInput {
  now: number;
  force: boolean;
  agent: AgentState | undefined;
  quietMs: number;
  switchingModel: boolean;
  lastSentAt: number | null;
}

export type Readiness =
  | { ready: true }
  | { ready: false; hold: SendLaterHold; retryAt: number | null };

// Whether a due prompt can go into its terminal now. It waits while the agent
// works or asks a question — typing then would interrupt or answer for you — and
// Send now skips that wait, as pressing ↵ would.
export function readiness(input: ReadinessInput): Readiness {
  const { now } = input;
  if (input.switchingModel) return { ready: false, hold: "busy", retryAt: now + SWITCH_RETRY_MS };
  if (input.force) return { ready: true };
  if (input.lastSentAt !== null && now - input.lastSentAt < SENT_SETTLE_MS) {
    return { ready: false, hold: "busy", retryAt: input.lastSentAt + SENT_SETTLE_MS };
  }
  if (input.agent === "needs-you") return { ready: false, hold: "asking", retryAt: null };
  if (input.agent === "working") {
    if (input.quietMs >= STALE_WORKING_MS) return { ready: true };
    return { ready: false, hold: "busy", retryAt: now + (STALE_WORKING_MS - input.quietMs) };
  }
  return { ready: true };
}
