import type { AgentState } from "./visual-data";

export const ACTIVITY_STATE: Record<
  AgentState,
  { label: string; dot: string; text: string }
> = {
  "needs-you": { label: "Needs you", dot: "bg-[#fbbf24]", text: "sidebar-waiting" },
  error: { label: "Problem", dot: "bg-[#f87171]", text: "text-[#fca5a5]" },
  working: { label: "Working", dot: "bg-[#22d3ee]", text: "sidebar-shimmer" },
  done: { label: "Done", dot: "bg-[#60a5fa]", text: "text-[#60a5fa]" },
};

export const ACTIVITY_FILTERS: { label: string; count: number; dot: string }[] = [
  { label: "needs you", count: 1, dot: "bg-[#fbbf24]" },
  { label: "problems", count: 1, dot: "bg-[#f87171]" },
  { label: "working", count: 2, dot: "bg-[#22d3ee]" },
  { label: "done", count: 1, dot: "bg-[#60a5fa]" },
];

export type ActivityRow = {
  project: string;
  tab: string;
  agent: string;
  state: AgentState;
  elapsed: string;
};

export const ACTIVITY_ROWS: ActivityRow[] = [
  {
    project: "shop-api",
    tab: "Tests for auth middleware",
    agent: "Codex",
    state: "needs-you",
    elapsed: "48s",
  },
  {
    project: "shop-api-flaky-test",
    tab: "Fix the flaky cart test",
    agent: "Codex",
    state: "error",
    elapsed: "1m",
  },
  {
    project: "shop-api",
    tab: "Rate-limit the login route",
    agent: "Claude Code",
    state: "working",
    elapsed: "3m 12s",
  },
  {
    project: "shop-api-attempt-3",
    tab: "Rate-limit the login route",
    agent: "Claude Code",
    state: "working",
    elapsed: "5m 40s",
  },
  {
    project: "shop-api-attempt-2",
    tab: "Rate-limit the login route",
    agent: "Claude Code",
    state: "done",
    elapsed: "6m",
  },
];
