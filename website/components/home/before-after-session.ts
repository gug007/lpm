import { gap, line, s, type Line } from "@/components/terminal-line";

// The Claude Code session waiting in auth-service, as Claude Code 2.1 paints a
// permission prompt (captured from the real binary). lpm shows it in its pane
// and the pile shows the same lines in a terminal window, so the two can sit row
// for row on top of each other across the divider.
//
// Colours are Claude Code's default dark theme.
const TEXT = "text-[#d4d4d4]";
const BRIGHT = "text-[#f2f2f2]";
const BOLD = "font-semibold text-[#f2f2f2]";
const INACTIVE = "text-[#999999]";
const COUNT = "font-semibold text-[#999999]";
const SUCCESS = "text-[#4eba65]";
const PERMISSION = "text-[#b1b9f9]";
const PERMISSION_BOLD = "font-semibold text-[#b1b9f9]";

// The rule above a permission prompt spans the terminal; the pane clips it.
const RULE = "─".repeat(120);

export const CLAUDE_SESSION: Line[] = [
  {
    spans: [s("❯ ", INACTIVE), s("run the pending migrations", BRIGHT)],
    gap: true,
    band: "-mx-[1em] bg-[#373737] px-[1em]",
  },
  gap(s("⏺ ", SUCCESS), s("Search", BOLD), s('(pattern: "db/migrations/*")', TEXT)),
  line(s("  ⎿  ", INACTIVE), s("Found ", INACTIVE), s("2", COUNT), s(" files", INACTIVE)),
  gap(s("⏺ ", BRIGHT), s("Both are additive. Running them now.", TEXT)),
  // Grey until the command runs: this is the call the prompt below is about.
  gap(s("⏺ ", INACTIVE), s("Bash", BOLD), s("(npm run db:migrate)", TEXT)),
  line(s("  ⎿  Waiting…", INACTIVE)),
  gap(s(RULE, PERMISSION)),
  line(s(" Bash command", PERMISSION_BOLD)),
  gap(s("   npm run db:migrate", TEXT)),
  line(s("   Run pending database migrations", INACTIVE)),
  gap(s(" Do you want to proceed?", TEXT)),
  line(s(" ❯ ", PERMISSION), s("1. ", INACTIVE), s("Yes", PERMISSION)),
  line(s("   2. ", INACTIVE), s("Yes, and don’t ask again for: npm run *", TEXT)),
  line(s("   3. ", INACTIVE), s("No", TEXT)),
];

/** The assistant's reply: where the pile's window crop of the session begins. */
export const WINDOW_FROM = 3;
/** The blue rule that opens the permission prompt. */
export const PROMPT_FROM = 6;
