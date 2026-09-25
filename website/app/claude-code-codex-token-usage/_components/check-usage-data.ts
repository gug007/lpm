import { CLAUDE_DOT, CODEX_DOT } from "./page-styles";

export type CheckCell = { code?: string; text: string; href?: string };

export type CheckRow = { label: string; claude: CheckCell; codex: CheckCell };

export const CHECK_TOOLS = [
  { key: "claude", name: "Claude Code", dot: CLAUDE_DOT },
  { key: "codex", name: "Codex", dot: CODEX_DOT },
] as const;

export const CHECK_ROWS: CheckRow[] = [
  {
    label: "In a session",
    claude: {
      code: "/usage",
      text: "Plan bars, session cost and a breakdown. `/cost` and `/stats` are aliases.",
    },
    codex: {
      code: "/status",
      text: "Limits as percent left, with reset times. `/usage` shows token activity.",
    },
  },
  {
    label: "Always on screen",
    claude: { code: "rate_limits", text: "In your statusline, on Pro and Max" },
    codex: { code: "/statusline", text: "Pin the rate-limit items to the footer" },
  },
  {
    label: "In the browser",
    claude: {
      text: "claude.ai Settings > Usage",
      href: "https://claude.ai/settings/usage",
    },
    codex: {
      text: "chatgpt.com/codex/settings/usage",
      href: "https://chatgpt.com/codex/settings/usage",
    },
  },
  {
    label: "With an API key",
    claude: { text: "Session tokens and cost, no plan bars" },
    codex: { text: "Billed at API rates, no plan windows" },
  },
  {
    label: "In lpm",
    claude: { text: "Usage card and sidebar meter, after one click" },
    codex: { text: "Usage card and sidebar meter, no setup" },
  },
];
