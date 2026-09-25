import {
  Gauge,
  PanelTop,
  ScrollText,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";
import type { Verdict } from "./verdict-icon";

export type ColumnId = "builtin" | "ccusage" | "codexbar" | "lpm";

export type ComparisonColumn = {
  id: ColumnId;
  name: string;
  kind: string;
  icon: LucideIcon;
  iconTone: string;
};

export type ComparisonCellValue = {
  verdict: Verdict;
  value: string;
  detail?: string;
  mono?: "value" | "detail";
};

export type ComparisonRow = {
  label: string;
  cells: Record<ColumnId, ComparisonCellValue>;
};

export type ComparisonPick = {
  lead: string;
  text: string;
};

export const HIGHLIGHT_COLUMN: ColumnId = "lpm";

export const COLUMNS: ComparisonColumn[] = [
  {
    id: "builtin",
    name: "Built-in commands",
    kind: "/usage · /status",
    icon: SquareTerminal,
    iconTone: "text-gray-500 dark:text-gray-400",
  },
  {
    id: "ccusage",
    name: "ccusage",
    kind: "CLI reports",
    icon: ScrollText,
    iconTone: "text-gray-500 dark:text-gray-400",
  },
  {
    id: "codexbar",
    name: "CodexBar",
    kind: "Menu-bar app",
    icon: PanelTop,
    iconTone: "text-gray-500 dark:text-gray-400",
  },
  {
    id: "lpm",
    name: "lpm",
    kind: "Mac app with your agents",
    icon: Gauge,
    iconTone: "text-emerald-600 dark:text-emerald-300",
  },
];

export const ROWS: ComparisonRow[] = [
  {
    label: "Live 5-hour and weekly %",
    cells: {
      builtin: {
        verdict: "yes",
        value: "Claude /usage bars, Codex /status",
        detail: "Codex shows percent left",
      },
      ccusage: {
        verdict: "partial",
        value: "Estimated 5-hour blocks",
        detail: "From your logs, not the plan's percentage",
      },
      codexbar: {
        verdict: "yes",
        value: "Fetched from each provider",
        detail: "Via OAuth, browser cookies or the CLI",
      },
      lpm: {
        verdict: "yes",
        value: "The percentages each CLI reports",
        detail: "No login, cookies or network requests",
      },
    },
  },
  {
    label: "Pace and run-out forecast",
    cells: {
      builtin: { verdict: "no", value: "Percent and reset time only" },
      ccusage: {
        verdict: "partial",
        value: "Burn rate and projected block total",
        detail: "Against a --token-limit you set, not the plan's",
      },
      codexbar: {
        verdict: "yes",
        value: "On pace, in deficit or in reserve",
        detail: "Plus “Runs out in …” or “Lasts until reset”",
      },
      lpm: {
        verdict: "yes",
        value: "Ahead, on or under pace",
        detail: "Plus “runs out in ~1h 4m, before reset”",
      },
    },
  },
  {
    label: "Alerts before the limit",
    cells: {
      builtin: {
        verdict: "partial",
        value: "Both CLIs warn as you get close",
        detail: "Codex: “less than 25% of your 5h limit left”",
      },
      ccusage: {
        verdict: "no",
        value: "No notifications",
        detail: "blocks flags WARNING near a --token-limit you set",
      },
      codexbar: {
        verdict: "yes",
        value: "Optional quota notifications",
        detail: "Per-window thresholds plus predictive pace alerts",
      },
      lpm: {
        verdict: "no",
        value: "No notifications",
        detail: "Bars turn amber at 80% and red at 95%",
      },
    },
  },
  {
    label: "Send a prompt when the limit resets",
    cells: {
      builtin: {
        verdict: "partial",
        value: "Claude Code continues the interrupted task",
        detail: "2.1.234 and later; Claude only",
      },
      ccusage: { verdict: "no", value: "No" },
      codexbar: { verdict: "no", value: "No" },
      lpm: {
        verdict: "yes",
        value: "Any prompt, Claude Code or Codex",
        detail: "Sent 30 seconds after the reset",
      },
    },
  },
  {
    label: "Token and cost history",
    cells: {
      builtin: {
        verdict: "partial",
        value: "Per tool",
        detail: "Claude /usage Stats tab; Codex /usage daily, weekly or cumulative",
      },
      ccusage: {
        verdict: "yes",
        value: "Daily, weekly, monthly, session",
        detail: "Priced from LiteLLM",
      },
      codexbar: {
        verdict: "yes",
        value: "Local cost scans",
        detail: "Daily and hourly trends",
      },
      lpm: {
        verdict: "yes",
        value: "Today, 7 days, 30 days, All time",
        detail: "Both tools together, estimated per model",
      },
    },
  },
  {
    label: "Usage by project",
    cells: {
      builtin: {
        verdict: "no",
        value: "Not by project",
        detail: "Claude's breakdown is by skill, subagent, plugin and MCP server",
      },
      ccusage: {
        verdict: "partial",
        value: "Claude Code only",
        detail: "--instances",
        mono: "detail",
      },
      codexbar: {
        verdict: "partial",
        value: "Project and session views",
        detail: "Local estimates",
      },
      lpm: {
        verdict: "yes",
        value: "Per lpm project, both tools",
        detail: "Includes sessions from other terminals",
      },
    },
  },
  {
    label: "Export",
    cells: {
      builtin: {
        verdict: "neutral",
        value: "OpenTelemetry export, statusline JSON",
        detail: "Opt-in, to your own collector or scripts",
      },
      ccusage: { verdict: "yes", value: "--json", mono: "value" },
      codexbar: { verdict: "yes", value: "Bundled codexbar CLI" },
      lpm: { verdict: "no", value: "No export" },
    },
  },
  {
    label: "Platform and price",
    cells: {
      builtin: { verdict: "neutral", value: "Part of each CLI" },
      ccusage: {
        verdict: "neutral",
        value: "Free, open source",
        detail: "Any OS with Node or Bun; many agent CLIs",
      },
      codexbar: {
        verdict: "neutral",
        value: "Free, MIT",
        detail: "macOS 14+ and Linux; dozens of providers",
      },
      lpm: {
        verdict: "neutral",
        value: "Free, MIT",
        detail: "macOS, with an iPhone app",
      },
    },
  },
];

export const PICKS: Record<ColumnId, ComparisonPick> = {
  builtin: {
    lead: "The built-in commands",
    text: "for a quick look at the session you're in.",
  },
  ccusage: {
    lead: "ccusage",
    text: "for terminal reports, JSON, and agent CLIs beyond Claude Code and Codex.",
  },
  codexbar: {
    lead: "CodexBar",
    text: "for limits in the menu bar across many providers, even with the CLIs closed.",
  },
  lpm: {
    lead: "lpm",
    text: "if you run your agents in lpm and want usage by project, a pace verdict, and the next prompt sent at the reset.",
  },
};
