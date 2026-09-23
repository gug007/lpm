export type ReplicaTone = "success" | "error" | "warning" | "neutral";

export type ReplicaJob = {
  emoji: string;
  label: string;
  scope: string;
  description: string;
  mono?: boolean;
  unread?: number;
  running?: string;
  paused?: boolean;
  tone?: ReplicaTone;
  status: string;
};

export const TONE_DOT: Record<ReplicaTone, string> = {
  success: "bg-[#22d3ee]",
  error: "bg-[#f87171]",
  warning: "bg-[#fbbf24]",
  neutral: "bg-[#919191]",
};

export const UNREAD_JOBS: ReplicaJob[] = [
  {
    emoji: "🔎",
    label: "Upstream watch",
    scope: "api",
    description:
      "Summarize the new upstream commits and flag anything that touches the API or database migrations.",
    unread: 1,
    tone: "success",
    status: "Every 2 hours · Next run today at 10:18 · Done, 52m ago",
  },
  {
    emoji: "📦",
    label: "Nightly dependency update",
    scope: "saas-app",
    description:
      "Update outdated dependencies to their latest compatible versions. Fix anything the upgrade breaks, run the tests, and summarize what changed.",
    unread: 2,
    tone: "success",
    status: "Every day at 02:00 · Next run tomorrow at 02:00 · Done, 7h ago",
  },
];

export const EARLIER_JOBS: ReplicaJob[] = [
  {
    emoji: "🧪",
    label: "Flaky test hunt",
    scope: "web",
    description: "npx playwright test --repeat-each=3",
    mono: true,
    running: "Running — 3m",
    status: "",
  },
  {
    emoji: "☀️",
    label: "Morning brief",
    scope: "No project",
    description:
      "Read the notes in ~/Notes/inbox and turn them into a short, prioritized plan for today.",
    tone: "success",
    status: "Every day between 07:30 and 08:30 · Next run tomorrow at 07:52 · Done, 1h ago",
  },
  {
    emoji: "🚀",
    label: "Deploy preview",
    scope: "docs-site",
    description: "deploy-preview",
    paused: true,
    tone: "success",
    status: "Mondays and Thursdays at 18:00 · Paused · Done, 1d ago",
  },
  {
    emoji: "🧹",
    label: "Weekly TODO sweep",
    scope: "3 projects",
    description:
      "List every TODO and FIXME, group them by area, and flag the ones that look risky.",
    tone: "success",
    status: "Fridays at 16:00 · Next run Friday at 16:00 · Done, 4d ago",
  },
];

export const SIDEBAR_PROJECTS = ["saas-app", "api", "web", "docs-site"];
