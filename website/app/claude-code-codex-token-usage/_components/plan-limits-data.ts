export type LimitVerdict = "ahead of pace" | "on pace" | "under pace";

export type LimitWindowSample = {
  label: string;
  used: number;
  elapsed: number;
  verdict: LimitVerdict;
  resets: string;
  runsOut?: string;
};

export type LimitCardSample = {
  name: string;
  dot: string;
  updated: string;
  windows: [LimitWindowSample, LimitWindowSample];
};

export type SidebarRowSample = {
  name: string;
  dot: string;
  used: number;
  elapsed: number;
  resets: string;
};

export const CLAUDE_DOT = "#D97757";
export const CODEX_DOT = "#10A37F";

export const LIMIT_CARDS: LimitCardSample[] = [
  {
    name: "Claude",
    dot: CLAUDE_DOT,
    updated: "updated just now",
    windows: [
      {
        label: "5-hour",
        used: 72,
        elapsed: 55,
        verdict: "ahead of pace",
        resets: "resets in 2h 15m",
        runsOut: "runs out in ~1h 4m, before reset",
      },
      {
        label: "Weekly",
        used: 38,
        elapsed: 46,
        verdict: "under pace",
        resets: "resets in 3d 19h",
      },
    ],
  },
  {
    name: "Codex",
    dot: CODEX_DOT,
    updated: "updated 2m ago",
    windows: [
      {
        label: "5-hour",
        used: 21,
        elapsed: 24,
        verdict: "on pace",
        resets: "resets in 3h 48m",
      },
      {
        label: "Weekly",
        used: 57,
        elapsed: 52,
        verdict: "on pace",
        resets: "resets in 3d 9h",
      },
    ],
  },
];

export const SIDEBAR_ROWS: SidebarRowSample[] = [
  { name: "Claude", dot: CLAUDE_DOT, used: 38, elapsed: 46, resets: "3d 19h" },
  { name: "Codex", dot: CODEX_DOT, used: 57, elapsed: 52, resets: "3d 9h" },
];

export function meterFill(pct: number): string {
  if (pct >= 95) return "bg-red-400";
  if (pct >= 80) return "bg-amber-400";
  return "bg-cyan-400";
}
