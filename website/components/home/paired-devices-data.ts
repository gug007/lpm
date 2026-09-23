import { gap, line, s, type Line } from "@/components/terminal-line";

export const ORANGE = "text-[#d97757]";
export const FAINT = "text-gray-600";
export const LIGHT = "text-gray-300";
const BOLD = "font-semibold text-gray-100";
const TEXT = "text-gray-100";
const DIM = "text-gray-500";

// Captured from the real CLI in a PTY (claude 2.1.214): glyphs, logo art and
// per-segment colors mirror that output. #4eba65 = claude's success green,
// #373737/#505050 = its user-prompt bubble, both lifted from the shipped dark
// theme
const CLAUDE_GREEN = "text-[#4eba65]";
const BOLD_DIM = "font-semibold text-gray-400";
const PROMPT_BUBBLE = "bg-[#373737]";
const PROMPT_CHAR = "text-[#707070]";

export const REPLY_TEXT = "yes — commit & open the PR";

export const CLAUDE_LINES: Line[] = [
  line(s(" ▐▛███▜▌ ", ORANGE), s(" "), s("Claude Code ", BOLD), s("v2.1.214", "text-gray-400")),
  line(s("▝▜█████▛▘", ORANGE), s("  "), s("Fable 5 with high effort · Claude Max", "text-gray-400")),
  line(s("  ▘▘ ▝▝  ", ORANGE), s("  "), s("~/Projects/auth-service", "text-gray-400")),
  {
    spans: [s("❯ ", PROMPT_CHAR), s("tighten the login rate limiter", TEXT), s(" ")],
    gap: true,
    bubble: PROMPT_BUBBLE,
  },
  gap(s("⏺ ", CLAUDE_GREEN), s("Read", BOLD), s("(src/auth/rateLimiter.ts)", TEXT)),
  line(
    s("  ⎿  Read ", DIM),
    s("84", BOLD_DIM),
    s(" lines (ctrl+o to expand)", DIM),
  ),
  gap(s("⏺ ", CLAUDE_GREEN), s("Update", BOLD), s("(src/auth/rateLimiter.ts)", TEXT)),
  line(
    s("  ⎿  Updated with ", DIM),
    s("18", BOLD_DIM),
    s(" additions and ", DIM),
    s("4", BOLD_DIM),
    s(" removals", DIM),
  ),
  gap(s("⏺ ", CLAUDE_GREEN), s("Bash", BOLD), s("(npm test -- rateLimiter)", TEXT)),
  line(s("  ⎿  8 passed, 0 failed (2.1s)", DIM)),
  gap(s("⏺ ", TEXT), s("The limiter now blocks after 5 attempts and", TEXT)),
  line(s("  resets on success. Commit and open a PR?", TEXT)),
  {
    spans: [s("❯ ", PROMPT_CHAR), s(REPLY_TEXT, TEXT), s(" ")],
    gap: true,
    bubble: PROMPT_BUBBLE,
  },
  gap(s("⏺ ", CLAUDE_GREEN), s("Bash", BOLD), s("(git push && gh pr create)", TEXT)),
  line(s("  ⎿  PR #204 opened", DIM)),
];

// Launch-header lines already on screen when the loop starts.
export const PREAMBLE = 3;

// Where the reply lands: the transcript stops one short of it while the agent
// waits for an answer.
export const REPLY_INDEX = 12;

export const TABS = ["claude", "codex", "zsh"];

export const PROJECTS = [
  { name: "auth-service", running: true, active: true },
  { name: "storefront", running: false, active: false },
  { name: "ml-pipeline", running: false, active: false },
];

// Pushes as the phone shows them: the project as the title, then
// "<terminal> — Agent is waiting for you" or "… — Agent finished"
// (NotificationService.swift).
export type Push = { title: string; body: string; time: string };

export const EARLIER_PUSH: Push = {
  title: "ml-pipeline",
  body: "codex — Agent finished",
  time: "12m ago",
};

export const WAITING_PUSH: Push = {
  title: "auth-service",
  body: "claude — Agent is waiting for you",
  time: "now",
};

// How each side names the other in its "Active in …" placeholder: the Mac
// sees the phone's device name, the phone sees the Mac's window.
export const PHONE_SURFACE = "iPhone";
export const MAC_SURFACE = "Main window";
