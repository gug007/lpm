import { line, s, type Line } from "@/components/terminal-line";

// The Claude Code session waiting in auth-service. lpm shows it in its pane and
// the pile shows the same lines in a terminal window, so the two can sit row for
// row on top of each other across the divider. Glyphs, logo art and tints mirror
// the real Claude Code TUI.
const TEXT = "text-[#d4d4d4]";
const DIM = "text-[#7a7a7a]";
const MUTED = "text-[#9a9a9a]";
const BOLD = "font-semibold text-[#e5e5e5]";
const ORANGE = "text-[#d97757]";
const GREEN = "text-[#4eba65]";
// The bright blue (ANSI 94) the permission prompt paints its rule, header and
// selected option.
const BLUE = "text-[#3b8eea]";
const BLUE_BOLD = "font-semibold text-[#3b8eea]";

// The launch banner's block logo needs a terminal's tall cell to read as art
// rather than as a smudge, so those rows carry their own line height.
export type SessionLine = Line & { banner?: boolean };

export const CLAUDE_SESSION: SessionLine[] = [
  { spans: [s(" ▐▛███▜▌ ", ORANGE), s(" "), s("Claude Code ", BOLD), s("v2.1.214", MUTED)], banner: true },
  { spans: [s("▝▜█████▛▘", ORANGE), s("  "), s("Fable 5 · Claude Max", MUTED)], banner: true },
  { spans: [s("  ▘▘ ▝▝  ", ORANGE), s("  "), s("~/Projects/auth-service", MUTED)], banner: true },
  {
    spans: [s("❯ ", "text-[#707070]"), s("run the pending migrations", TEXT), s(" ")],
    gap: true,
    bubble: "bg-[#373737]",
  },
  { spans: [s("⏺ ", GREEN), s("Read", BOLD), s("(db/schema.rb)", TEXT)], gap: true },
  line(s("  ⎿  Read ", DIM), s("214", "font-semibold text-[#9a9a9a]"), s(" lines", DIM)),
  {
    spans: [s("⏺ ", GREEN), s("Bash", BOLD), s("(bin/rails db:migrate:status)", TEXT)],
    gap: true,
  },
  line(s("  ⎿  ", DIM), s("2", "font-semibold text-[#9a9a9a]"), s(" migrations pending", DIM)),
  { spans: [s("⏺ ", TEXT), s("Both are additive. Running them now.", TEXT)], gap: true },
  { spans: [s("⏺ ", GREEN), s("Bash", BOLD), s("(npm run db:migrate)", TEXT)], gap: true },
  { spans: [s("──────────────────────────────", BLUE)], gap: true },
  line(s(" Bash command", BLUE_BOLD)),
  line(s("   npm run db:migrate", TEXT)),
  line(s(" Do you want to proceed?", TEXT)),
  line(s(" ❯ ", BLUE), s("1. ", DIM), s("Yes", BLUE)),
  line(s("   2. Yes, and don't ask again", DIM)),
  line(s("   3. No", DIM)),
];

/** Where the permission prompt starts: the blue rule above "Bash command". */
export const PROMPT_FROM = 10;
