import { gap, line, s, type Line } from "@/components/terminal-line";
import { CLAUDE_SESSION, PROMPT_FROM } from "./before-after-session";

// The pile is deliberately colourless: greys, the two agent CLIs' own brand
// marks, and nothing else. State colour — green for running, amber for an agent
// that needs you — only exists on the other side of the divider, which is the
// whole argument the section makes. Do not add emerald here.
const TEXT = "text-[#d4d4d4]";
const LIGHT = "text-[#9a9a9a]";
const DIM = "text-[#6b6b6b]";
const FAINT = "text-[#5a5a5a]";
const BOLD = "font-semibold text-[#d4d4d4]";
const CLAUDE_ORANGE = "text-[#d97757]";
const PROMPT_CHAR = "text-[#707070]";
// Reuses the pd-blink keyframe, which the reduced-motion block already kills.
const CARET = "text-[#9a9a9a] [animation:pd-blink_1.05s_steps(1)_infinite]";

export type Layout = "desk" | "phone";

/** A spot on a stage, in stage em. `w`/`h` override the window's drawn size. */
export type Place = { x: number; y: number; r: number; w?: number; h?: number; lines?: Line[] };

export type PileWindow = {
  key: string;
  kind: "service" | "agent";
  label: string;
  /** Services wear their port; agents wear their CLI's mark instead. */
  badge?: string;
  mark?: { t: string; c: string };
  lines: Line[];
  /** Set at the lpm pane's line height, so its rows land on the pane's rows. */
  session?: boolean;
  /** Drawn size, in em. */
  w: number;
  h: number;
} & Record<Layout, Place>;

// Both pictures share one stage per layout, so the divider trades a window for
// the place it takes in lpm: server and redis lie over their tabs, the Claude
// window lies over the pane line for line, and api buries its options. The
// offsets were fitted to the replica's em geometry; moving the replica, its
// tabs or the pane's line height means refitting them.
export const STAGES: Record<Layout, { w: number; h: number; lpm: { x: number; y: number; w: number; h: number } }> = {
  desk: { w: 100, h: 47.5, lpm: { x: 49, y: 4.5, w: 45, h: 38 } },
  phone: { w: 39, h: 42, lpm: { x: 1, y: 2, w: 37, h: 38 } },
};

// Ordered back to front: DOM order is paint order.
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
    w: 19.6,
    h: 8.6,
    desk: { x: 6.5, y: 6.5, r: -3 },
    phone: { x: -1.7, y: 21.4, r: -3 },
  },
  {
    // The point of the whole left half: an agent stopped to ask permission and
    // the api window lies across its options.
    key: "claude-auth",
    kind: "agent",
    label: "claude · auth-service",
    mark: { t: "✻", c: CLAUDE_ORANGE },
    session: true,
    lines: CLAUDE_SESSION.slice(PROMPT_FROM),
    w: 25,
    h: 15.2,
    desk: { x: 60.65, y: 17.24, r: 0, w: 30, h: 25.17, lines: CLAUDE_SESSION.slice(6) },
    phone: { x: 12.65, y: 24.71, r: 0, h: 15.19 },
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
    w: 18.8,
    h: 8.4,
    desk: { x: 59.05, y: 4.09, r: 1.5 },
    phone: { x: 6.15, y: 1.59, r: 1.5 },
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
    w: 21,
    h: 8.6,
    desk: { x: 56.2, y: 37.42, r: 3 },
    phone: { x: 12.4, y: 34.95, r: 3 },
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
    w: 16,
    h: 8.2,
    desk: { x: 68.78, y: 6.29, r: -2.5 },
    phone: { x: 15.58, y: 3.79, r: -2.5 },
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
    w: 20.4,
    h: 8.6,
    desk: { x: 25, y: 34, r: 2.5 },
    phone: { x: -0.2, y: 32.4, r: 2.5, w: 14 },
  },
  {
    // Finished a while ago, asked a question, and nobody saw it.
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
    w: 23.4,
    h: 14.2,
    desk: { x: 6.5, y: 21.8, r: -2, h: 12.4 },
    phone: { x: 20, y: 12.8, r: -2, w: 16.9, h: 11.4 },
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
      gap(s("• ", DIM), s("Read", BOLD), s(" app/models/plan.rb", TEXT)),
      gap(
        s("• ", TEXT),
        s("Working ", LIGHT),
        s("(41s • esc to interrupt)", FAINT),
      ),
    ],
    w: 23.2,
    h: 12.8,
    desk: { x: 21.5, y: 8.4, r: 2 },
    phone: { x: -0.4, y: 10.4, r: 2, w: 16.4, h: 10 },
  },
];

export const SERVICE_COUNT = WINDOWS.filter((w) => w.kind === "service").length;
export const AGENT_COUNT = WINDOWS.filter((w) => w.kind === "agent").length;
