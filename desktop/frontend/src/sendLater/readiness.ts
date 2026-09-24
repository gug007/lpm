import type { AgentState } from "../agentStatus";
import type { SendLaterHold } from "../store/sendLater";

// How long a terminal that just took a prompt is left alone: its agent reports
// that it started only once its own hook runs, and until then it looks ready.
export const SENT_SETTLE_MS = 20_000;
// An agent interrupted mid-turn keeps reporting it is working. After this long
// with no output at all it is taken to be idle.
export const STALE_WORKING_MS = 2 * 60_000;
// An agent still drawing its screen after starting isn't reading input yet;
// once it has been quiet this long, it is.
export const SETTLED_QUIET_MS = 1_500;
const SWITCH_RETRY_MS = 2_000;
const STARTING_RETRY_MS = 5_000;
const OCCUPIED_RETRY_MS = 10_000;

// What holds the terminal's tty: its shell at the prompt, some other program
// (the agent, a server…), or unknown (a remote pane, an older Mac).
export type Foreground = "shell" | "program" | "unknown";

export interface ReadinessInput {
  now: number;
  force: boolean;
  // Written for an agent: one must be running there. Otherwise it's a shell
  // command, and the shell must be at its prompt.
  forAgent: boolean;
  foreground: Foreground;
  agent: AgentState | undefined;
  quietMs: number;
  switchingModel: boolean;
  lastSentAt: number | null;
}

export type Readiness =
  | { ready: true }
  | { ready: false; hold: SendLaterHold; retryAt: number | null };

const hold = (h: SendLaterHold, retryAt: number | null): Readiness => ({ ready: false, hold: h, retryAt });

// Whether a due prompt can go into its terminal now. It never goes into a shell
// that is waiting for its agent to start — the shell would run it — nor into a
// question the agent is asking, which it would answer. It waits while the agent
// works; Send now skips that wait, as pressing ↵ would.
export function readiness(input: ReadinessInput): Readiness {
  const { now } = input;
  if (input.switchingModel) return hold("busy", now + SWITCH_RETRY_MS);
  if (input.forAgent && input.foreground === "shell") return hold("starting", now + STARTING_RETRY_MS);
  if (input.agent === "needs-you") return hold("asking", null);
  if (input.forAgent && input.agent !== "working" && input.quietMs < SETTLED_QUIET_MS) {
    return hold("starting", now + (SETTLED_QUIET_MS - input.quietMs));
  }
  if (input.force) return { ready: true };
  if (!input.forAgent && input.foreground === "program") return hold("busy", now + OCCUPIED_RETRY_MS);
  if (input.lastSentAt !== null && now - input.lastSentAt < SENT_SETTLE_MS) {
    return hold("busy", input.lastSentAt + SENT_SETTLE_MS);
  }
  if (input.agent === "working") {
    if (input.quietMs >= STALE_WORKING_MS) return { ready: true };
    return hold("busy", now + (STALE_WORKING_MS - input.quietMs));
  }
  return { ready: true };
}

const SHELLS = new Set(["zsh", "bash", "sh", "fish", "dash", "ksh", "tcsh", "csh", "nu", "login"]);

export function foregroundKind(command: string | null | undefined): Foreground {
  const name = (command ?? "").trim().replace(/^-/, "");
  if (!name) return "unknown";
  return SHELLS.has(name) ? "shell" : "program";
}
