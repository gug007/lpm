import { CLAUDE_DOT, CODEX_DOT } from "./page-styles";

export type LegendItem = { lead: string; text: string };

export const LEGEND: LegendItem[] = [
  {
    lead: "The tick is the clock.",
    text: "It marks how much of the window has passed. A bar past its tick is using the window faster than time is passing.",
  },
  {
    lead: "The verdict compares the two.",
    text: "Used divided by elapsed above 1.15 is ahead of pace, below 0.85 is under pace, and anything between is on pace. In the first 5% of a window there's no pace verdict, only “limit reached” once you hit 100%.",
  },
  {
    lead: "Run-out time shows only when it matters.",
    text: "It appears when you're ahead of pace and the current rate would use up the rest before the reset. Bars turn amber at 80% and red at 95%, and a reading older than 15 minutes dims.",
  },
];

export type Explainer = {
  dot: string;
  title: string;
  items: string[];
  source: { label: string; href: string };
};

export const EXPLAINERS: Explainer[] = [
  {
    dot: CLAUDE_DOT,
    title: "How Claude Code limits work",
    items: [
      "A session limit resets every five hours, and a weekly limit across all models resets at a fixed time assigned to your account, not a week after you start.",
      "claude.ai, Claude Code, Claude Desktop and the IDE extensions draw on one allowance.",
      "Anthropic doesn't publish a token number. Max 5x and Max 20x give five and 20 times Pro's per-session usage.",
    ],
    source: {
      label: "Anthropic: Max plan usage limits",
      href: "https://support.claude.com/en/articles/11049741-what-is-the-max-plan",
    },
  },
  {
    dot: CODEX_DOT,
    title: "How Codex limits work",
    items: [
      "Codex records its limit windows with each reply. Depending on your ChatGPT plan that is usually a 5-hour and a weekly window, or only a weekly one; credit-based Enterprise and Edu workspaces have no fixed windows.",
      "OpenAI publishes allowances as estimated local messages per five hours, and they vary by model.",
      "At the limit the current turn finishes. Plus and Pro can buy credits, or an API key bills at API rates instead.",
    ],
    source: {
      label: "OpenAI: Codex pricing and limits",
      href: "https://learn.chatgpt.com/docs/pricing",
    },
  },
];

export const CHECKED = { label: "September 24, 2026", iso: "2026-09-24" };
