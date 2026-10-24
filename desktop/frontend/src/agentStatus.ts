import {
  STATUS_DONE,
  STATUS_ERROR,
  STATUS_RUNNING,
  STATUS_WAITING,
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

const ERROR_NAME_CLASS = "text-[var(--accent-red-text)]";

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
  const className = isWaiting
    ? "sidebar-waiting"
    : isError
    ? ERROR_NAME_CLASS
    : isWorking
    ? "sidebar-shimmer"
    : null;
  return { isDone, isWaiting, isError, className };
}

// The rows listed under an expanded project already pulse while they wait and
// shimmer while they work, so the name only carries those states while the rows
// are folded away. A problem stays on the name either way.
export function rowNameClass(status: ProjectStatus, tasksListed: boolean): string | null {
  if (!tasksListed) return status.className;
  return status.isError ? ERROR_NAME_CLASS : null;
}

// The agents whose hooks report status. Status entries carry no provider
// field; each agent's hooks encode it in the key prefix
// (src-tauri/src/agentkind.rs).
const STATUS_AGENTS = [
  { provider: "claude", keyPrefix: "claude_code_", label: "Claude Code", short: "Claude", color: "#D97757" },
  { provider: "codex", keyPrefix: "codex_", label: "Codex", short: "Codex", color: "#10A37F" },
  { provider: "gemini", keyPrefix: "gemini_", label: "Gemini CLI", short: "Gemini", color: "#4796E3" },
  { provider: "cursor", keyPrefix: "cursor_", label: "Cursor", short: "Cursor", color: "var(--text-primary)" },
  { provider: "opencode", keyPrefix: "opencode_", label: "OpenCode", short: "OpenCode", color: "#FAB283" },
  { provider: "omp", keyPrefix: "omp_", label: "omp", short: "omp", color: "#F97316" },
] as const;

export type StatusProvider = (typeof STATUS_AGENTS)[number]["provider"] | "unknown";

export interface ProviderMeta {
  label: string;
  short: string;
  color: string;
}

const PROVIDER_META: Record<string, ProviderMeta> = {
  ...Object.fromEntries(STATUS_AGENTS.map(({ provider, label, short, color }) => [provider, { label, short, color }])),
  unknown: { label: "Agent", short: "Agent", color: "var(--text-muted)" },
};

export function providerMeta(key: string): ProviderMeta {
  return PROVIDER_META[key] ?? { label: key, short: key, color: "var(--text-muted)" };
}

export function statusProvider(key: string): StatusProvider {
  return STATUS_AGENTS.find(({ keyPrefix }) => key.startsWith(keyPrefix))?.provider ?? "unknown";
}
