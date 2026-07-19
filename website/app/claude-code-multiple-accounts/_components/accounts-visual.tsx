import type { ReactNode } from "react";

const ORANGE = "text-[#d97757]";
const BOLD = "font-semibold text-gray-100";
const TEXT = "text-gray-100";
const DIM = "text-gray-500";
const FAINT = "text-gray-600";
const BOLD_DIM = "font-semibold text-gray-400";
const CLAUDE_GREEN = "text-[#4eba65]";
const PROMPT_BUBBLE = "bg-[#373737]";
const PROMPT_CHAR = "text-[#707070]";

type Span = { t: string; c?: string };
type Line = { spans: Span[]; gap?: boolean; bubble?: string };

const s = (t: string, c?: string): Span => ({ t, c });
const line = (...spans: Span[]): Line => ({ spans });
const gap = (...spans: Span[]): Line => ({ spans, gap: true });
const prompt = (t: string): Line => ({
  spans: [s("❯ ", PROMPT_CHAR), s(t, TEXT), s(" ")],
  gap: true,
  bubble: PROMPT_BUBBLE,
});

type Badge = { label: string; className: string };
type Pane = {
  project: string;
  badge: Badge;
  status: ReactNode;
  lines: Line[];
};

const WORK_BADGE: Badge = {
  label: "Work",
  className:
    "border-amber-500/30 bg-amber-500/[0.08] text-amber-300/90",
};
const PERSONAL_BADGE: Badge = {
  label: "Personal",
  className: "border-teal-500/30 bg-teal-500/[0.08] text-teal-300/90",
};

const PONDERING = (
  <>
    <span className={ORANGE}>✻ Pondering… </span>
    <span className={FAINT}>(21s · ↓ 1.4k tokens)</span>
  </>
);
const CRUNCHING = (
  <>
    <span className={ORANGE}>✻ Crunching… </span>
    <span className={FAINT}>(9s · ↓ 0.6k tokens)</span>
  </>
);

const PANES: Pane[] = [
  {
    project: "client-app",
    badge: WORK_BADGE,
    status: PONDERING,
    lines: [
      line(s(" ▐▛███▜▌ ", ORANGE), s(" "), s("Claude Code", BOLD)),
      line(s("▝▜█████▛▘", ORANGE), s("  "), s("Fable 5 · company seat", "text-gray-400")),
      line(s("  ▘▘ ▝▝  ", ORANGE), s("  "), s("~/Projects/client-app", "text-gray-400")),
      prompt("tighten the login rate limiter"),
      gap(s("⏺ ", CLAUDE_GREEN), s("Read", BOLD), s("(src/auth/rateLimiter.ts)", TEXT)),
      line(s("  ⎿  Read ", DIM), s("84", BOLD_DIM), s(" lines", DIM)),
      gap(s("⏺ ", CLAUDE_GREEN), s("Update", BOLD), s("(src/auth/rateLimiter.ts)", TEXT)),
      line(s("  ⎿  ", DIM), s("+18", BOLD_DIM), s(" −4", BOLD_DIM)),
    ],
  },
  {
    project: "side-project",
    badge: PERSONAL_BADGE,
    status: CRUNCHING,
    lines: [
      line(s(" ▐▛███▜▌ ", ORANGE), s(" "), s("Claude Code", BOLD)),
      line(s("▝▜█████▛▘", ORANGE), s("  "), s("Fable 5 · personal", "text-gray-400")),
      line(s("  ▘▘ ▝▝  ", ORANGE), s("  "), s("~/Projects/side-project", "text-gray-400")),
      prompt("add a dark mode toggle to settings"),
      gap(s("⏺ ", CLAUDE_GREEN), s("Read", BOLD), s("(src/settings/Theme.tsx)", TEXT)),
      line(s("  ⎿  Read ", DIM), s("52", BOLD_DIM), s(" lines", DIM)),
      gap(s("⏺ ", CLAUDE_GREEN), s("Write", BOLD), s("(src/settings/Theme.tsx)", TEXT)),
      line(s("  ⎿  ", DIM), s("+31", BOLD_DIM), s(" −2", BOLD_DIM)),
    ],
  },
];

function TerminalLine({ line }: { line: Line }) {
  const spans = line.spans.map((span, i) => (
    <span key={i} className={span.c ?? "text-gray-300"}>
      {span.t}
    </span>
  ));
  return (
    <div
      className={`whitespace-pre tabular-nums text-[9px] sm:text-[10px]${
        line.gap ? " mt-3" : ""
      }`}
    >
      {line.bubble ? <span className={line.bubble}>{spans}</span> : spans}
    </div>
  );
}

function RunningDot() {
  return (
    <span className="relative inline-flex h-1.5 w-1.5" aria-hidden="true">
      <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
    </span>
  );
}

function TerminalPane({ pane }: { pane: Pane }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[#1a1a1a]">
      <div className="flex items-center gap-2 border-b border-[#2d2d2d] bg-[#161616] px-3 py-2">
        <span className="truncate text-[10px] font-medium text-gray-200">
          {pane.project}
        </span>
        <span
          className={`rounded-full border px-1.5 py-0.5 text-[8px] font-semibold ${pane.badge.className}`}
        >
          {pane.badge.label}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[8px] font-medium text-emerald-400">
          <RunningDot />
          running
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-3 py-2.5 font-mono leading-5 [mask-image:linear-gradient(to_right,#000_92%,transparent)] [-webkit-mask-image:linear-gradient(to_right,#000_92%,transparent)]">
        {pane.lines.map((l, i) => (
          <TerminalLine key={i} line={l} />
        ))}
        <div className="mt-3 whitespace-pre text-[9px] sm:text-[10px]">
          {pane.status}
        </div>
      </div>
    </div>
  );
}

export function AccountsVisual() {
  return (
    <section className="pb-4 pt-2 sm:pb-8">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <p className="sr-only">
          An illustration of one lpm window running two Claude Code agents at
          the same time. The left pane, project &ldquo;client-app&rdquo;, is
          pinned to a Work account and is tightening a login rate limiter. The
          right pane, project &ldquo;side-project&rdquo;, is pinned to a
          Personal account and is adding a dark mode toggle. Both panes show a
          live &ldquo;running&rdquo; indicator, so the two accounts are working
          in parallel rather than one switching to the other.
        </p>

        <div
          aria-hidden="true"
          className="relative overflow-hidden rounded-xl bg-[#111113] p-1.5 shadow-2xl shadow-gray-300/60 ring-1 ring-black/15 dark:shadow-black/60 dark:ring-[#3a3a3c]"
        >
          <div className="overflow-hidden rounded-lg bg-[#1a1a1a]">
            <div className="relative flex h-8 shrink-0 items-center border-b border-[#2d2d2d] px-3">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              </div>
              <span className="absolute left-1/2 -translate-x-1/2 text-[10px] text-gray-400">
                lpm
              </span>
            </div>
            <div className="grid h-[19rem] grid-cols-1 sm:grid-cols-2 sm:divide-x sm:divide-[#2d2d2d]">
              {PANES.map((pane, i) => (
                <div
                  key={pane.project}
                  className={
                    i === 1
                      ? "hidden border-t border-[#2d2d2d] sm:flex sm:border-t-0"
                      : "flex"
                  }
                >
                  <TerminalPane pane={pane} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
