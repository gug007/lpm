import { gap, line, s, type Line } from "@/components/terminal-line";

export type AgentState = "working" | "needs-you" | "done" | "error";
export type RowKind = "project" | "copy" | "worktree";

export type SidebarAgent = {
  title: string;
  state: AgentState;
  elapsed: string;
};

export type RollupSegment = { text: string; className: string };

export type SidebarRow = {
  name: string;
  kind: RowKind;
  running: boolean;
  selected?: boolean;
  agents?: SidebarAgent[];
  rollup?: RollupSegment[];
};

export const STATE_TONE: Record<AgentState, string> = {
  working: "sidebar-shimmer",
  "needs-you": "sidebar-waiting",
  done: "text-[#60a5fa]",
  error: "text-[#f87171]",
};

export const SIDEBAR_ROWS: SidebarRow[] = [
  {
    name: "shop-api",
    kind: "project",
    running: true,
    selected: true,
    agents: [
      { title: "Rate-limit the login route", state: "working", elapsed: "3m" },
      { title: "Tests for auth middleware", state: "needs-you", elapsed: "48s" },
    ],
  },
  {
    name: "shop-api-attempt-2",
    kind: "copy",
    running: false,
    agents: [{ title: "Rate-limit the login route", state: "done", elapsed: "6m" }],
  },
  {
    name: "shop-api-attempt-3",
    kind: "copy",
    running: false,
    agents: [{ title: "Rate-limit the login route", state: "working", elapsed: "5m" }],
  },
  {
    name: "shop-api-flaky-test",
    kind: "worktree",
    running: false,
    agents: [{ title: "Fix the flaky cart test", state: "error", elapsed: "1m" }],
  },
  {
    name: "web-app",
    kind: "project",
    running: true,
    rollup: [
      { text: "1 needs you", className: "sidebar-waiting" },
      { text: "2 working", className: "text-[#67e8f9]" },
      { text: "1 running", className: "text-[#34d399]" },
    ],
  },
  { name: "docs-site", kind: "project", running: false },
];

const ORANGE = "text-[#d97757]";
const CLAUDE_GREEN = "text-[#4eba65]";
const BOLD = "font-semibold text-gray-100";
const TEXT = "text-gray-200";
const DIM = "text-gray-500";
const FAINT = "text-gray-600";
const CODEX_ACCENT = "text-[#67e8f9]";
const PROMPT_BUBBLE = "bg-[#373737]";

export const CLAUDE_LINES: Line[] = [
  {
    ...line(s("❯ ", "text-[#707070]"), s("rate-limit the login route, 5 tries a minute ", TEXT)),
    bubble: PROMPT_BUBBLE,
  },
  gap(s("⏺ ", CLAUDE_GREEN), s("Read", BOLD), s("(src/routes/login.ts)", TEXT)),
  line(s("  ⎿  Read ", DIM), s("112", "font-semibold text-gray-400"), s(" lines", DIM)),
  gap(s("⏺ ", CLAUDE_GREEN), s("Update", BOLD), s("(src/routes/login.ts)", TEXT)),
  line(s("  ⎿  ", DIM), s("+24", "font-semibold text-gray-400"), s(" −3", "font-semibold text-gray-400")),
  gap(s("⏺ ", CLAUDE_GREEN), s("Bash", BOLD), s("(npm test -- login)", TEXT)),
  line(s("  ⎿  Running…", DIM)),
  gap(s("✻ Pondering… ", ORANGE), s("(3m 12s · ↓ 4.1k tokens)", FAINT)),
];

export const CODEX_LINES: Line[] = [
  line(s("› ", CODEX_ACCENT), s("write tests for the auth middleware", TEXT)),
  gap(s("• ", DIM), s("Edited ", BOLD), s("src/middleware/auth.test.ts", TEXT)),
  line(s("  └ ", DIM), s("+38 −2", "text-gray-400")),
  gap(s("• ", DIM), s("Ran ", BOLD), s("npm test -- auth", TEXT)),
  line(s("  └ 14 passed", DIM)),
  gap(s("  Would you like to run the following command?", "font-semibold text-gray-100")),
  gap(s("  $ ", DIM), s("npm run db:seed", TEXT)),
  gap(s("› 1. Yes, proceed", CODEX_ACCENT)),
  line(s("  2. No, and tell Codex what to do differently", DIM)),
];
