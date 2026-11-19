import { providerMeta, type StatusProvider } from "./agentStatus";
import { detectAICLI } from "./slashCommands";

export interface ComposerTarget {
  // The tab's label.
  label: string;
  // The agent running in the tab, by name; null for a plain shell. Left out
  // when the composer can't tell, as a guest typing into a shared tab can't.
  agent?: string | null;
  // Whether the agent has taken a prompt yet.
  started?: boolean;
  // The next prompt asks the agent for a video of its answer.
  video?: boolean;
}

// The composer's placeholder, shared by the live input and its closed-state
// stand-in (ComposerReopenBar) so both always read the same and can't drift.
// It names who the text goes to: the agent, or the shell a line will run in.
export function composerPlaceholder({ label, agent, started = false, video = false }: ComposerTarget): string {
  if (video) return agent ? `Ask ${agent} for a video…` : "Ask for a video…";
  if (agent === undefined) return `Send to ${label}…`;
  if (agent === null) return `Run a command in ${label}…`;
  return started ? `Reply to ${agent}…` : `Ask ${agent}…`;
}

// The agent a terminal runs: from its launch command, or from the agent's own
// status reports when it was started by hand in a plain shell. Null for a shell
// with no agent in it.
export function composerAgentName(
  launchCmd: string | undefined,
  reported: StatusProvider | undefined,
): string | null {
  const provider = detectAICLI(launchCmd) ?? (reported && reported !== "unknown" ? reported : null);
  return provider ? providerMeta(provider).short : null;
}

// Hover dwell before a composer action button reveals its tooltip. Shared across
// the footer buttons so they surface in step and stay tunable from one place.
export const COMPOSER_TOOLTIP_DELAY_MS = 500;
