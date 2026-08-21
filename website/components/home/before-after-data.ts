import { gap, line, s, type Line } from "@/components/terminal-line";

// The pile is deliberately colourless: greys, the two agent CLIs' own brand
// marks, and nothing else. State colour — green for running, amber for an agent
// that needs you — only exists on the other side of the divider, which is the
// whole argument the section makes. Do not add emerald here.
const TEXT = "text-[#d4d4d4]";
const LIGHT = "text-[#9a9a9a]";
const DIM = "text-[#6b6b6b]";
const FAINT = "text-[#5a5a5a]";
const BOLD = "font-semibold text-[#d4d4d4]";
// Claude Code's own mark, and the bright blue (ANSI 94) its permission prompt
// paints the rule, the header and the selected option.
const CLAUDE_ORANGE = "text-[#d97757]";
const CLAUDE_BLUE = "text-[#3b8eea]";
const CLAUDE_BLUE_BOLD = "font-semibold text-[#3b8eea]";
const PROMPT_CHAR = "text-[#707070]";
// Reuses the pd-blink keyframe, which the reduced-motion block already kills.
const CARET = "text-[#9a9a9a] [animation:pd-blink_1.05s_steps(1)_infinite]";

export type PileWindow = {
  key: string;
  kind: "service" | "agent";
  label: string;
  /** Services wear their port; agents wear their CLI's mark instead. */
  badge?: string;
  mark?: { t: string; c: string };
  lines: Line[];
  /** Scatter geometry, in design pixels inside a 440 x 410 stage. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Resting angle when scattered, and the tamer one used when they stack. */
  r: number;
  rc: number;
};

export const STAGE_W = 440;
export const STAGE_H = 410;

// Ordered back to front: DOM order is paint order, and below `sm` it is also
// reading order, where the scatter collapses into an overlapping cascade.
export const WINDOWS: PileWindow[] = [
  {
    key: "web",
    kind: "service",
    label: "web",
    badge: ":3000",
    lines: [
      line(s("▲ Next.js 16.3.0", DIM)),
      line(s("- Local:  ", LIGHT), s("localhost:3000", TEXT)),
      line(s("✓ Ready in 268ms", LIGHT)),
    ],
    x: 0,
    y: 8,
    w: 196,
    h: 86,
    r: -3.5,
    rc: 1.25,
  },
  {
    // The point of the whole left half: an agent stopped to ask permission and
    // the answer row is sliced off by the window in front of it.
    key: "claude-auth",
    kind: "agent",
    label: "claude · auth-service",
    mark: { t: "✻", c: CLAUDE_ORANGE },
    lines: [
      line(s("──────────────────────────", CLAUDE_BLUE)),
      line(s(" Bash command", CLAUDE_BLUE_BOLD)),
      line(s("   npm run db:migrate", TEXT)),
      line(s(" Do you want to proceed?", TEXT)),
      line(s(" ❯ ", CLAUDE_BLUE), s("1. ", DIM), s("Yes", CLAUDE_BLUE)),
      line(s("   2. Yes, and don't ask again", DIM)),
      line(s("   3. No", DIM)),
    ],
    x: 184,
    y: 0,
    w: 238,
    h: 152,
    r: 2,
    rc: -1,
  },
  {
    key: "server",
    kind: "service",
    label: "server",
    badge: ":8080",
    lines: [
      line(s("listening on :8080", LIGHT)),
      line(s("db=ok  redis=ok", DIM)),
      line(s("GET /healthz 200 1.2ms", DIM)),
    ],
    x: 6,
    y: 80,
    w: 188,
    h: 84,
    r: 2,
    rc: -1.5,
  },
  {
    key: "api",
    kind: "service",
    label: "api",
    badge: ":3001",
    lines: [
      line(s("=> Booting Puma", DIM)),
      line(s("* Listening on ", LIGHT), s("0.0.0.0:3001", TEXT)),
      line(s("Completed 200 OK in 3ms", DIM)),
    ],
    x: 170,
    y: 88,
    w: 210,
    h: 86,
    r: 3.5,
    rc: 1.5,
  },
  {
    key: "redis",
    kind: "service",
    label: "redis",
    badge: ":6379",
    lines: [
      line(s("* Ready to accept connections", DIM)),
      line(s("1 client connected", LIGHT)),
      line(s("> ", DIM), s("▌", CARET)),
    ],
    x: 262,
    y: 150,
    w: 160,
    h: 82,
    r: -4.5,
    rc: 1,
  },
  {
    key: "notebook",
    kind: "service",
    label: "notebook",
    badge: ":8888",
    lines: [
      line(s("[I 09:02] Jupyter Server 2.14.2", DIM)),
      line(s("http://localhost:8888/lab?token=…", TEXT)),
      line(s("epoch 7/20  loss 0.2413", LIGHT)),
    ],
    x: 2,
    y: 172,
    w: 204,
    h: 86,
    r: -2,
    rc: -1.25,
  },
  {
    // Finished twenty minutes ago, asked a question, and nobody saw it.
    key: "claude-docs",
    kind: "agent",
    label: "claude · docs-site",
    mark: { t: "✻", c: CLAUDE_ORANGE },
    lines: [
      line(s("⏺ ", TEXT), s("Renamed the old URLs and added", TEXT)),
      line(s("  redirects. Commit and open a PR?", TEXT)),
      gap(s("✻ Worked for 52s", DIM)),
      gap(s("❯ ", PROMPT_CHAR), s("▌", CARET)),
    ],
    x: 4,
    y: 246,
    w: 234,
    h: 142,
    r: 2.5,
    rc: 1.5,
  },
  {
    key: "codex",
    kind: "agent",
    label: "codex · saas-app",
    mark: { t: ">_", c: "text-[#919191]" },
    lines: [
      {
        spans: [
          s("› ", "font-semibold text-[#6b6b6b]"),
          s("migrate the plans table to cents", TEXT),
        ],
        band: "bg-white/[0.07]",
      },
      gap(s("• ", DIM), s("Edited", BOLD), s(" app/models/plan.rb", TEXT)),
      gap(
        s("• ", TEXT),
        s("Working ", LIGHT),
        s("(41s • esc to interrupt)", FAINT),
      ),
    ],
    x: 204,
    y: 262,
    w: 232,
    h: 128,
    r: -2,
    rc: -1,
  },
];

export const SERVICE_COUNT = WINDOWS.filter((w) => w.kind === "service").length;
export const AGENT_COUNT = WINDOWS.filter((w) => w.kind === "agent").length;
