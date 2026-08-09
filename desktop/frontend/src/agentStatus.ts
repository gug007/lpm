import {
  STATUS_DONE,
  STATUS_ERROR,
  STATUS_RUNNING,
  STATUS_WAITING,
  type ProjectInfo,
  type StatusEntry,
} from "./types";

/** What an agent is doing, in product words. `idle` is the catch-all for a
 *  status nothing acts on. */
export type AgentState = "needs-you" | "error" | "working" | "done" | "idle";

export const AGENT_STATE_LABEL: Record<AgentState, string> = {
  "needs-you": "Needs you",
  error: "Problem",
  working: "Working",
  done: "Done",
  idle: "Idle",
};

/** How a state reads: the color it takes, and for the two the app animates, the
 *  motion — a shimmer while working, an amber pulse while it needs you. */
export const AGENT_STATE_TONE: Record<AgentState, string> = {
  "needs-you": "sidebar-waiting",
  error: "text-[var(--accent-red)]",
  working: "sidebar-shimmer",
  done: "text-[var(--accent-blue)]",
  idle: "text-[var(--text-muted)]",
};

/** Attention order; lower is more urgent. */
export const AGENT_STATE_RANK: Record<AgentState, number> = {
  "needs-you": 0,
  error: 1,
  working: 2,
  done: 3,
  idle: 4,
};

export function agentStateOf(value: string): AgentState {
  if (value === STATUS_WAITING) return "needs-you";
  if (value === STATUS_ERROR) return "error";
  if (value === STATUS_RUNNING) return "working";
  if (value === STATUS_DONE) return "done";
  return "idle";
}

export interface ProjectStatus {
  isDone: boolean;
  isWaiting: boolean;
  isError: boolean;
  className: string | null;
}

// A project holds one status per agent; the row decoration shows the most
// urgent of them.
export function computeProjectStatus(
  entries: StatusEntry[] | undefined,
): ProjectStatus {
  let isWorking = false;
  let isDone = false;
  let isWaiting = false;
  let isError = false;
  for (const entry of entries ?? []) {
    switch (agentStateOf(entry.value)) {
      case "working":
        isWorking = true;
        break;
      case "done":
        isDone = true;
        break;
      case "needs-you":
        isWaiting = true;
        break;
      case "error":
        isError = true;
        break;
    }
  }
  const className = isError
    ? "text-red-400"
    : isWaiting
    ? "sidebar-waiting"
    : isWorking
    ? "sidebar-shimmer"
    : null;
  return { isDone, isWaiting, isError, className };
}

export interface AgentAmbient {
  needsYou: number;
  hasError: boolean;
}

/** The whole app's agents rolled up, for the sidebar's ambient badge. */
export function agentAmbient(projects: ProjectInfo[]): AgentAmbient {
  let needsYou = 0;
  let hasError = false;
  for (const project of projects) {
    if (!project.statusEntries) continue;
    for (const entry of project.statusEntries) {
      const state = agentStateOf(entry.value);
      if (state === "needs-you") needsYou++;
      else if (state === "error") hasError = true;
    }
  }
  return { needsYou, hasError };
}

export type StatusProvider = "claude" | "codex" | "unknown";

export interface ProviderMeta {
  label: string;
  short: string;
  color: string;
}

const PROVIDER_META: Record<string, ProviderMeta> = {
  claude: { label: "Claude Code", short: "Claude", color: "#D97757" },
  codex: { label: "Codex", short: "Codex", color: "#10A37F" },
  unknown: { label: "Agent", short: "Agent", color: "var(--text-muted)" },
};

export function providerMeta(key: string): ProviderMeta {
  return PROVIDER_META[key] ?? { label: key, short: key, color: "var(--text-muted)" };
}

const CLAUDE_PREFIX = "claude_code_";
const CODEX_PREFIX = "codex_";

// Status entries carry no provider field; the agents encode it in the key
// prefix (`claude_code_<sessionId>`, `codex_<paneId>`).
export function statusProvider(key: string): StatusProvider {
  if (key.startsWith(CLAUDE_PREFIX)) return "claude";
  if (key.startsWith(CODEX_PREFIX)) return "codex";
  return "unknown";
}
