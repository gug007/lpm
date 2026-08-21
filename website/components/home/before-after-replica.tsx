import { Bell, Check, Columns2, Zap } from "lucide-react";
import { line, s, TerminalLine, type Line } from "@/components/terminal-line";

// The same window every lpm user works in, at the same footprint the pile on
// the other side of the divider occupies. Palette and structure are lifted from
// components/demo/*, which mirrors desktop/frontend/src.
const TEXT = "text-[#d4d4d4]";
const DIM = "text-[#7a7a7a]";
const BOLD = "font-semibold text-[#e5e5e5]";
const CLAUDE_GREEN = "text-[#4eba65]";
const CLAUDE_BLUE = "text-[#3b8eea]";
const CLAUDE_BLUE_BOLD = "font-semibold text-[#3b8eea]";

// The agent states the app paints, in its own colours: amber while a turn waits
// on you, a gradient shimmer while it works, blue once it lands.
const NEEDS_YOU = "text-[#fbbf24] motion-safe:animate-pulse";
const WORKING = "sidebar-shimmer";
const DONE = "text-[#60a5fa]";

type Agent = { name: string; tone: string; elapsed: string; mark?: "bell" | "check" };
type Row = { name: string; running: boolean; selected?: boolean; agent?: Agent };

const ROWS: Row[] = [
  {
    name: "auth-service",
    running: true,
    selected: true,
    agent: { name: "claude", tone: NEEDS_YOU, elapsed: "4m", mark: "bell" },
  },
  {
    name: "saas-app",
    running: true,
    agent: { name: "codex", tone: WORKING, elapsed: "41s" },
  },
  {
    name: "docs-site",
    running: true,
    agent: { name: "claude", tone: DONE, elapsed: "52s", mark: "check" },
  },
  { name: "ml-pipeline", running: false },
];

const ORANGE = "text-[#d97757]";
const MUTED = "text-[#9a9a9a]";

// The session the pile could only show a sliver of, in front of you and in
// colour. Glyphs, logo art and tints mirror the real Claude Code TUI.
type BannerLine = Line & { banner?: boolean };

const TRANSCRIPT: BannerLine[] = [
  // The launch banner's block logo needs a terminal's tall cell to read as art
  // rather than as a smudge, so these three rows carry their own line height.
  { spans: [s(" ▐▛███▜▌ ", ORANGE), s(" "), s("Claude Code ", BOLD), s("v2.1.214", MUTED)], banner: true },
  { spans: [s("▝▜█████▛▘", ORANGE), s("  "), s("Fable 5 · Claude Max", MUTED)], banner: true },
  { spans: [s("  ▘▘ ▝▝  ", ORANGE), s("  "), s("~/Projects/auth-service", MUTED)], banner: true },
  {
    spans: [s("❯ ", "text-[#707070]"), s("run the pending migrations", TEXT), s(" ")],
    gap: true,
    bubble: "bg-[#373737]",
  },
  {
    spans: [s("⏺ ", CLAUDE_GREEN), s("Read", BOLD), s("(db/schema.rb)", TEXT)],
    gap: true,
  },
  line(s("  ⎿  Read ", DIM), s("214", "font-semibold text-[#9a9a9a]"), s(" lines", DIM)),
  {
    spans: [
      s("⏺ ", CLAUDE_GREEN),
      s("Bash", BOLD),
      s("(bin/rails db:migrate:status)", TEXT),
    ],
    gap: true,
  },
  line(s("  ⎿  ", DIM), s("2", "font-semibold text-[#9a9a9a]"), s(" migrations pending", DIM)),
  {
    spans: [s("⏺ ", TEXT), s("Both are additive. Running them now.", TEXT)],
    gap: true,
  },
  {
    spans: [s("⏺ ", CLAUDE_GREEN), s("Bash", BOLD), s("(npm run db:migrate)", TEXT)],
    gap: true,
  },
  { spans: [s("──────────────────────────────", CLAUDE_BLUE)], gap: true },
  line(s(" Bash command", CLAUDE_BLUE_BOLD)),
  line(s("   npm run db:migrate", TEXT)),
  line(s(" Do you want to proceed?", TEXT)),
  line(s(" ❯ ", CLAUDE_BLUE), s("1. ", DIM), s("Yes", CLAUDE_BLUE)),
  line(s("   2. Yes, and don't ask again", DIM)),
  line(s("   3. No", DIM)),
];

export const PROJECT_COUNT = ROWS.length;
export const AGENT_ROW_COUNT = ROWS.filter((r) => r.agent).length;

const MARK_SLOT = "flex h-[0.9em] w-[0.9em] shrink-0 items-center justify-center";

function ProjectRow({ row }: { row: Row }) {
  return (
    <div>
      <div
        className={`flex items-center gap-[0.7em] rounded-[0.45em] px-[0.7em] py-[0.4em] text-[1.05em] ${
          row.selected ? "bg-[#333333] text-[#e5e5e5]" : "text-[#b3b3b3]"
        }`}
      >
        <span
          className={
            row.running
              ? "h-[0.6em] w-[0.6em] shrink-0 rounded-full bg-emerald-400"
              : "h-[0.6em] w-[0.6em] shrink-0 rounded-full border border-[#4a4a4a]"
          }
        />
        {/* The app rolls a project's agent state up onto the project row, so
            the name itself waits, works and lands. */}
        <span className={`min-w-0 truncate ${row.agent ? row.agent.tone : ""}`}>
          {row.name}
        </span>
      </div>
      {row.agent && (
        // One line per agent under the project it runs in: the tab it lives in,
        // coloured by what it is doing, a mark, and how long it has taken.
        <div className="flex items-center gap-[0.5em] rounded-[0.45em] py-[0.22em] pl-[1.15em] pr-[0.6em] text-[0.95em] text-[#8e8e8e]">
          <span className={MARK_SLOT} />
          <span className={`min-w-0 flex-1 truncate ${row.agent.tone}`}>
            {row.agent.name}
          </span>
          <span className={MARK_SLOT}>
            {row.agent.mark === "bell" ? (
              <Bell className="h-full w-full text-[#fbbf24]" strokeWidth={2.25} />
            ) : row.agent.mark === "check" ? (
              <Check className="h-full w-full text-[#60a5fa]" strokeWidth={2.5} />
            ) : null}
          </span>
          <span className="shrink-0 tabular-nums">{row.agent.elapsed}</span>
        </div>
      )}
    </div>
  );
}

function Tab({
  children,
  active,
  icon,
  port,
  tone,
  show = "flex",
}: {
  children: React.ReactNode;
  active?: boolean;
  icon: React.ReactNode;
  port?: string;
  /** Status tint, on the label only — the app leaves the pill itself neutral. */
  tone?: string;
  /** Container-query gate: a tab the pane is too narrow to hold is dropped
   *  rather than clipped. */
  show?: string;
}) {
  return (
    <div
      className={`shrink-0 items-center gap-[0.45em] rounded-[0.4em] px-[0.6em] py-[0.15em] ${show} ${
        active ? "bg-white/[0.1] text-[#d4d4d4]" : "text-[#a0a0a0]"
      }`}
    >
      {icon}
      <span className={`font-mono text-[0.95em] font-medium ${tone ?? ""}`}>
        {children}
      </span>
      {port && (
        <span className="font-mono text-[0.9em] tabular-nums text-[#8e8e8e]">
          {port}
        </span>
      )}
    </div>
  );
}

const RUNNING_ZAP = (
  <Zap
    className="h-[0.85em] w-[0.85em] shrink-0 text-emerald-400"
    strokeWidth={2}
    fill="currentColor"
  />
);

export function LpmReplica() {
  return (
    <div
      aria-hidden="true"
      data-on-dark
      className="flex h-full w-full overflow-hidden rounded-[0.9em] bg-[#1e1e1e] ring-1 ring-white/10 shadow-[0_12px_36px_-14px_rgba(0,0,0,0.4)] dark:shadow-[0_12px_36px_-12px_rgba(0,0,0,0.9)]"
    >
      <aside className="flex w-[11.4em] shrink-0 flex-col border-r border-[#2e2e2e] bg-[#1e1e1e]">
        <div className="flex h-[2.6em] shrink-0 items-center gap-[0.55em] px-[0.9em] pt-[0.3em]">
          <span className="h-[0.7em] w-[0.7em] rounded-full bg-[#ff5f57]" />
          <span className="h-[0.7em] w-[0.7em] rounded-full bg-[#febc2e]" />
          <span className="h-[0.7em] w-[0.7em] rounded-full bg-[#28c840]" />
        </div>
        <div className="px-[1em] pb-[0.4em] pt-[0.5em] text-[0.85em] font-medium uppercase tracking-wider text-[#919191]">
          Projects
        </div>
        <nav className="flex flex-col gap-[0.15em] px-[0.5em]">
          {ROWS.map((row) => (
            <ProjectRow key={row.name} row={row} />
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-[0.4em] overflow-hidden bg-[#2d2d2d] px-[0.6em] py-[0.4em]">
          <Tab
            show="hidden @min-[26rem]:flex"
            icon={
              <Columns2 className="h-[0.95em] w-[0.95em] shrink-0 text-[#8e8e8e]" />
            }
          >
            All
          </Tab>
          <Tab icon={RUNNING_ZAP} port=":8080">
            server
          </Tab>
          <Tab show="hidden @min-[21rem]:flex" icon={RUNNING_ZAP} port=":6379">
            redis
          </Tab>
          <Tab
            active
            tone={NEEDS_YOU}
            icon={<span className="text-[0.95em] leading-none text-[#d97757]">✻</span>}
          >
            claude
          </Tab>
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-[1em] py-[0.8em] font-mono [mask-image:linear-gradient(to_right,#000_95%,transparent)] [-webkit-mask-image:linear-gradient(to_right,#000_95%,transparent)]">
          {TRANSCRIPT.map((l, i) => (
            <TerminalLine
              key={i}
              line={l}
              size={`text-[0.95em] ${l.banner ? "leading-[1.9]" : "leading-[1.5]"}`}
              fallback={TEXT}
              gapClass="mt-[1.5em]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
