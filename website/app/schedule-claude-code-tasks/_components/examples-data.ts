export type ExampleJob = {
  emoji: string;
  title: string;
  kind: "AI prompt" | "Command";
  task: string;
  mono?: boolean;
  details: { label: string; value: string; mono?: boolean }[];
};

export const EXAMPLES: ExampleJob[] = [
  {
    emoji: "📦",
    title: "Nightly dependency update",
    kind: "AI prompt",
    task: "Update outdated dependencies to their latest compatible versions. Fix anything the upgrade breaks, run the tests, and summarize what changed.",
    details: [
      { label: "Agent", value: "Claude Code · Full access" },
      { label: "Works on", value: "A fresh copy" },
      { label: "When", value: "Every day at 02:00" },
      { label: "Check after", value: "npm test", mono: true },
    ],
  },
  {
    emoji: "🩺",
    title: "Morning test triage",
    kind: "AI prompt",
    task: "Install dependencies and run the test suite. For each failure, find the cause and fix it if the fix is small. List anything you left alone and why.",
    details: [
      { label: "Agent", value: "Claude Code · Full access" },
      { label: "Works on", value: "A Git worktree" },
      { label: "When", value: "Weekdays at 08:30" },
      { label: "Check after", value: "npm test", mono: true },
    ],
  },
  {
    emoji: "🔎",
    title: "Upstream watch",
    kind: "AI prompt",
    task: "Summarize the new upstream commits and flag anything that touches the API or database migrations.",
    details: [
      { label: "Agent", value: "Codex · Read only" },
      { label: "Works on", value: "The project itself" },
      { label: "When", value: "Every 2 hours" },
      { label: "Only if", value: "git fetch && git log HEAD..@{u} --oneline | grep .", mono: true },
    ],
  },
  {
    emoji: "🧹",
    title: "Weekly TODO sweep",
    kind: "AI prompt",
    task: "List every TODO and FIXME, group them by area, and flag the ones that look risky. Don't change any files.",
    details: [
      { label: "Agent", value: "Claude Code · Read only" },
      { label: "Runs in", value: "3 projects" },
      { label: "When", value: "Fridays at 16:00" },
    ],
  },
  {
    emoji: "☀️",
    title: "Morning brief",
    kind: "AI prompt",
    task: "Read the notes in ~/Notes/inbox and turn them into a short, prioritized plan for today.",
    details: [
      { label: "Agent", value: "Claude Code · Read only" },
      { label: "Runs in", value: "No project (home folder)" },
      { label: "When", value: "Every day between 07:30 and 08:30" },
    ],
  },
  {
    emoji: "🧪",
    title: "Flaky test hunt",
    kind: "Command",
    task: "npx playwright test --repeat-each=3",
    mono: true,
    details: [
      { label: "Runs in", value: "web" },
      { label: "When", value: "Every 4–8 hours" },
      { label: "Result", value: "Output and outcome in the job's history" },
    ],
  },
];
