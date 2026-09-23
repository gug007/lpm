export type BlockState = "ran" | "failed" | "upcoming" | "expected" | "paused";

export type BoardBlock = {
  time: string;
  name: string;
  emoji: string;
  accent: string;
  state: BlockState;
  unread?: number;
};

export type BoardRow =
  | { kind: "band"; from: string; to: string; cells: (BoardBlock | null)[] }
  | { kind: "quiet"; from: string; to: string };

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const TODAY = 2;

export const ACCENT = {
  saas: "#a78bfa",
  docs: "#fb923c",
  neutral: "#94a3b8",
  failed: "#f87171",
  muted: "#919191",
};

const deps = (time: string, state: BlockState, unread?: number): BoardBlock => ({
  time,
  name: "Nightly dependency update",
  emoji: "📦",
  accent: state === "failed" ? ACCENT.failed : ACCENT.saas,
  state,
  unread,
});

const brief = (time: string, state: BlockState): BoardBlock => ({
  time,
  name: "Morning brief",
  emoji: "☀️",
  accent: ACCENT.neutral,
  state,
});

const deploy = (state: BlockState): BoardBlock => ({
  time: "18:00",
  name: "Deploy preview",
  emoji: "🚀",
  accent: state === "paused" ? ACCENT.muted : ACCENT.docs,
  state,
});

const sweep: BoardBlock = {
  time: "16:00",
  name: "Weekly TODO sweep",
  emoji: "🧹",
  accent: ACCENT.neutral,
  state: "upcoming",
};

export const ROWS: BoardRow[] = [
  {
    kind: "band",
    from: "00:00",
    to: "03:00",
    cells: [
      deps("02:03", "ran"),
      deps("02:01", "failed"),
      deps("02:04", "ran", 2),
      deps("02:00", "upcoming"),
      deps("02:00", "upcoming"),
      deps("02:00", "upcoming"),
      deps("02:00", "upcoming"),
    ],
  },
  { kind: "quiet", from: "03:00", to: "06:00" },
  {
    kind: "band",
    from: "06:00",
    to: "09:00",
    cells: [
      brief("07:48", "ran"),
      brief("08:11", "ran"),
      brief("07:36", "ran"),
      brief("07:30–08:30", "expected"),
      brief("07:30–08:30", "expected"),
      brief("07:30–08:30", "expected"),
      brief("07:30–08:30", "expected"),
    ],
  },
  { kind: "quiet", from: "09:00", to: "15:00" },
  {
    kind: "band",
    from: "15:00",
    to: "18:00",
    cells: [null, null, null, null, sweep, null, null],
  },
  {
    kind: "band",
    from: "18:00",
    to: "21:00",
    cells: [deploy("ran"), null, null, deploy("paused"), null, null, null],
  },
  { kind: "quiet", from: "21:00", to: "24:00" },
];

export const LEGEND_PROJECTS = [
  { label: "saas-app", color: ACCENT.saas },
  { label: "docs-site", color: ACCENT.docs },
];
