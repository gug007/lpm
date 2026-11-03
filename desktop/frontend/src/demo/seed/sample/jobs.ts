import { SEED_BRANCH_DAY } from "./clock";

// The Automations view's rows as `list_all_jobs` returns them, and each job's
// runs as `job_history` does. Times are unix seconds, set off the schedule each
// job keeps, so a weekday job's last run really fell on a weekday at 09:00.

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"];
const EVERY_DAY = [...WEEKDAYS, "sat", "sun"];
const JS_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const secs = (d: Date) => Math.floor(d.getTime() / 1000);

// The schedule's fire point `step` days from today: today's when step is 0.
function fireOn(step: number, atMinutes: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + step);
  d.setHours(Math.floor(atMinutes / 60), atMinutes % 60, 0, 0);
  return d;
}

function fires(days: string[], atMinutes: number, direction: 1 | -1, count: number): Date[] {
  const now = Date.now();
  const out: Date[] = [];
  for (let step = 0; out.length < count && Math.abs(step) < 30; step += direction) {
    const d = fireOn(step, atMinutes);
    const due = direction < 0 ? d.getTime() <= now : d.getTime() > now;
    if (due && days.includes(JS_DAYS[d.getDay()])) out.push(d);
  }
  return out;
}

const calendar = (days: string[], atMinutes: number) => ({ mode: "calendar", atMinutes, days });

interface Run {
  at: Date;
  result: "completed" | "error";
  output: string;
  durationSecs: number;
  costUsd?: number;
  unread?: boolean;
  // A question the run left waiting on the user.
  ask?: { id: string; questions: Record<string, unknown>[] };
}

const runAt = (run: Run) => secs(run.at) + run.durationSecs;

function openAsk(run: Run) {
  return run.ask && { ...run.ask, askedAt: runAt(run), status: "open" };
}

function entry(run: Run) {
  const ask = openAsk(run);
  return {
    at: runAt(run),
    result: run.result,
    ...(run.unread ? { unread: true } : {}),
    output: run.output,
    durationSecs: run.durationSecs,
    ...(run.costUsd ? { costUsd: run.costUsd } : {}),
    ...(ask ? { asks: [ask] } : {}),
  };
}

interface JobSpec {
  id: string;
  label: string;
  emoji: string;
  agent: "claude" | "codex";
  prompt: string;
  schedule: Record<string, unknown>;
  enabled: boolean;
  next: Date | null;
  runs: Run[];
  // A project's own job, or a shared one in ~/.lpm/global.yml.
  scope: { project: string } | { targets: string[] };
}

function row(job: JobSpec) {
  const last = job.runs[job.runs.length - 1];
  const waiting = last && openAsk(last);
  const where = "project" in job.scope ? job.scope.project : job.scope.targets[0];
  const scope =
    "project" in job.scope
      ? { source: "project", project: job.scope.project, targets: [job.scope.project] }
      : {
          source: "global",
          runningCount: 0,
          targetCount: job.scope.targets.length,
          targets: job.scope.targets,
        };
  return {
    id: job.id,
    valid: true,
    label: job.label,
    emoji: job.emoji,
    enabled: job.enabled,
    duplicate: false,
    runKind: "prompt",
    description: job.prompt,
    schedule: job.schedule,
    lastRunAt: last ? secs(last.at) : null,
    lastResult: last?.result ?? null,
    lastNote: last?.output ?? null,
    lastDurationSecs: last?.durationSecs ?? null,
    nextFireAt: job.enabled && job.next ? secs(job.next) : null,
    running: false,
    runningSince: null,
    unread: job.runs.filter((r) => r.unread).length,
    lastMessage: last?.output ?? null,
    agent: job.agent,
    model: "",
    effort: "",
    standalone: false,
    ...(waiting ? { ask: { ...waiting, project: where, at: runAt(last) } } : {}),
    ...scope,
  };
}

const [triageLast, triageBefore] = fires(WEEKDAYS, 9 * 60, -1, 2);
const [bumpLast] = fires(EVERY_DAY, 2 * 60, -1, 1);
const [notesLast] = fires(["fri"], 17 * 60, -1, 1);
const flakyRun = fireOn(-2, 21 * 60 + 12);

const JOBS: JobSpec[] = [
  {
    id: "morning-triage",
    label: "Morning triage",
    emoji: "✻",
    agent: "claude",
    prompt:
      "Read the issues opened overnight, label them and draft a fix plan for anything urgent.",
    schedule: calendar(WEEKDAYS, 9 * 60),
    enabled: true,
    next: fires(WEEKDAYS, 9 * 60, 1, 1)[0],
    scope: { project: "saas-app" },
    runs: [
      {
        at: triageBefore,
        result: "completed",
        output: "Triaged 6 new issues — 2 look like duplicates of #418.",
        durationSecs: 196,
        costUsd: 0.38,
        unread: true,
      },
      {
        at: triageLast,
        result: "completed",
        output: "Drafted a fix plan for #431 (checkout retries), waiting on your call.",
        durationSecs: 244,
        costUsd: 0.46,
        unread: true,
        ask: {
          id: "triage-431",
          questions: [
            {
              id: "q1",
              type: "confirm",
              text: "Open a pull request with the retry fix for #431?",
              yes: "Open PR",
              no: "Not yet",
            },
          ],
        },
      },
    ],
  },
  {
    id: "dependency-bump",
    label: "Nightly dependency bump",
    emoji: "📦",
    agent: "codex",
    prompt: "Run the dependency update, then fix whatever the upgrade breaks.",
    schedule: calendar(EVERY_DAY, 2 * 60),
    enabled: true,
    next: fires(EVERY_DAY, 2 * 60, 1, 1)[0],
    scope: { targets: ["saas-app", "docs-site", "mobile-app"] },
    runs: [
      {
        at: bumpLast,
        result: "completed",
        output: `Bumped 14 packages across 3 projects, test suites green.\n\nOpened branch chore/deps-${SEED_BRANCH_DAY} in saas-app.`,
        durationSecs: 548,
        costUsd: 0.91,
        unread: true,
      },
    ],
  },
  {
    id: "flaky-hunt",
    label: "Flaky test hunt",
    emoji: "🧪",
    agent: "claude",
    prompt: "Rerun the test suite 20 times and report the tests that only sometimes pass.",
    schedule: { mode: "manual" },
    enabled: true,
    next: null,
    scope: { project: "auth-service" },
    runs: [
      {
        at: flakyRun,
        result: "error",
        output: "Run aborted — postgres service was not up when the suite started.",
        durationSecs: 14,
      },
    ],
  },
  {
    id: "release-notes",
    label: "Release notes draft",
    emoji: "📝",
    agent: "claude",
    prompt: "Turn the week's merged PRs into a changelog entry.",
    schedule: calendar(["fri"], 17 * 60),
    enabled: false,
    next: null,
    scope: { project: "docs-site" },
    runs: [
      {
        at: notesLast,
        result: "completed",
        output: "Drafted notes for v0.9.4 — 11 PRs summarised.",
        durationSecs: 182,
        costUsd: 0.29,
      },
    ],
  },
];

export const SAMPLE_JOBS = JOBS.map(row);

/** Each job's runs, oldest first, by job id. */
export const SAMPLE_JOB_HISTORY: Record<string, unknown[]> = Object.fromEntries(
  JOBS.map((job) => [job.id, job.runs.map(entry)]),
);
