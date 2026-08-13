export type JobResult = "ok" | "blocked" | "failed";

export type JobMessage = { at: string; text: string };

export type DemoJob = {
  id: string;
  label: string;
  emoji: string;
  description: string;
  /** Which folders the job runs in — shown on the row so the list stays flat. */
  scope: string;
  schedule: string;
  nextRun: string;
  enabled: boolean;
  running: boolean;
  lastResult?: JobResult;
  lastRun: string;
  unread: number;
  messages: JobMessage[];
};

export const JOB_RESULT_LABEL: Record<JobResult, string> = {
  ok: "Finished",
  blocked: "Blocked",
  failed: "Failed",
};

export const JOB_RESULT_DOT: Record<JobResult, string> = {
  ok: "bg-[#4ade80]",
  blocked: "bg-[#fbbf24]",
  failed: "bg-[#f87171]",
};

export const INITIAL_JOBS: DemoJob[] = [
  {
    id: "morning-triage",
    label: "Morning triage",
    emoji: "✻",
    description:
      "Claude reads issues opened overnight, labels them and drafts a fix plan for anything urgent.",
    scope: "saas-app",
    schedule: "Weekdays at 09:00",
    nextRun: "next run in 4h 12m",
    enabled: true,
    running: false,
    lastResult: "ok",
    lastRun: "18h ago",
    unread: 2,
    messages: [
      { at: "09:00", text: "Triaged 6 new issues — 2 look like duplicates of #418." },
      { at: "09:04", text: "Drafted a fix plan for #431 (checkout retries), waiting on your call." },
    ],
  },
  {
    id: "dependency-bump",
    label: "Nightly dependency bump",
    emoji: "📦",
    description: "Runs the update, then lets Codex fix whatever the upgrade breaks.",
    scope: "3 projects",
    schedule: "Every day at 02:00",
    nextRun: "next run in 15h 42m",
    enabled: true,
    running: false,
    lastResult: "ok",
    lastRun: "8h ago",
    unread: 1,
    messages: [
      { at: "02:07", text: "Bumped 14 packages across 3 projects, test suites green." },
      { at: "02:09", text: "Opened branch chore/deps-aug-13 in saas-app." },
    ],
  },
  {
    id: "flaky-hunt",
    label: "Flaky test hunt",
    emoji: "🧪",
    description: "Reruns the suite 20 times and reports the tests that only sometimes pass.",
    scope: "auth-service",
    schedule: "Manual",
    nextRun: "",
    enabled: true,
    running: false,
    lastResult: "failed",
    lastRun: "2d ago",
    unread: 0,
    messages: [
      { at: "21:12", text: "Run aborted — postgres service was not up when the suite started." },
    ],
  },
  {
    id: "release-notes",
    label: "Release notes draft",
    emoji: "📝",
    description: "Turns the week's merged PRs into a changelog entry.",
    scope: "docs-site",
    schedule: "Fridays at 17:00",
    nextRun: "",
    enabled: false,
    running: false,
    lastResult: "ok",
    lastRun: "6d ago",
    unread: 0,
    messages: [{ at: "17:03", text: "Drafted notes for v0.9.4 — 11 PRs summarised." }],
  },
];

export function unreadJobCount(jobs: DemoJob[]): number {
  return jobs.filter((job) => job.unread > 0).length;
}

export function runningJobCount(jobs: DemoJob[]): number {
  return jobs.filter((job) => job.running).length;
}

export function jobStatusLine(job: DemoJob): string {
  if (job.running) return "Running — started just now";
  return [
    job.schedule,
    job.enabled ? job.nextRun : "Paused",
    job.lastResult ? `${JOB_RESULT_LABEL[job.lastResult]}, ${job.lastRun}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
