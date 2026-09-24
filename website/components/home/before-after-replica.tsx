import { Bell, Check, Columns2, Zap } from "lucide-react";
import { TerminalLine } from "@/components/terminal-line";
import { CLAUDE_SESSION } from "./before-after-session";

// The same window every lpm user works in, placed on the stage where the pile it
// replaces lies. Palette and structure are lifted from components/demo/*, which
// mirrors desktop/frontend/src.
const TEXT = "text-[#d4d4d4]";

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
  { name: "ml-pipeline", running: true },
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
  compact,
}: {
  children: React.ReactNode;
  active?: boolean;
  icon: React.ReactNode;
  port?: string;
  /** Status tint, on the label only — the app leaves the pill itself neutral. */
  tone?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex shrink-0 items-center gap-[0.45em] rounded-[0.4em] py-[0.15em] ${
        compact ? "px-[0.5em]" : "px-[0.6em]"
      } ${active ? "bg-white/[0.1] text-[#d4d4d4]" : "text-[#a0a0a0]"}`}
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

// `compact` is the phone stage's narrower window: the All tab goes and the tabs
// close up, so the ones that stay keep their full labels.
export function LpmReplica({ compact = false }: { compact?: boolean }) {
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
        <div
          className={`flex shrink-0 items-center overflow-hidden bg-[#2d2d2d] py-[0.4em] ${
            compact ? "gap-[0.3em] px-[0.45em]" : "gap-[0.4em] px-[0.6em]"
          }`}
        >
          {!compact && (
            <Tab
              icon={
                <Columns2 className="h-[0.95em] w-[0.95em] shrink-0 text-[#8e8e8e]" />
              }
            >
              All
            </Tab>
          )}
          <Tab compact={compact} icon={RUNNING_ZAP} port=":8080">
            server
          </Tab>
          <Tab compact={compact} icon={RUNNING_ZAP} port=":6379">
            redis
          </Tab>
          <Tab
            compact={compact}
            active
            tone={NEEDS_YOU}
            icon={<span className="text-[0.95em] leading-none text-[#d97757]">✻</span>}
          >
            claude
          </Tab>
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-[1em] py-[0.8em] font-mono [mask-image:linear-gradient(to_right,#000_95%,transparent)] [-webkit-mask-image:linear-gradient(to_right,#000_95%,transparent)]">
          {CLAUDE_SESSION.map((l, i) => (
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
