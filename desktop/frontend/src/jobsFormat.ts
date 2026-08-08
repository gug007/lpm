// Pure formatting and draft/payload helpers for scheduled jobs. Kept free of
// React and the bridge so the schedule <-> human-string mapping and the YAML
// jobs-block round-trip can be unit tested directly.

import { composerValueToText, EMPTY_COMPOSER, textToPrompt } from "./composerValue";
import type { ComposerValue } from "./composerValue";

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const WEEKDAYS: Weekday[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

const DAY_SHORT: Record<Weekday, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

const DAY_PLURAL: Record<Weekday, string> = {
  mon: "Mondays",
  tue: "Tuesdays",
  wed: "Wednesdays",
  thu: "Thursdays",
  fri: "Fridays",
  sat: "Saturdays",
  sun: "Sundays",
};

export type JobRunKind = "action" | "cmd" | "prompt";

// `everyMaxSecs` (interval) and `untilMinutes` (calendar) open the schedule into
// a range the actual run time is drawn from, rather than a fixed point; `times`
// puts more than one run in that window and `pickDays` uses only some of `days`
// each week. All are absent on a schedule that fires at a fixed point.
export type JobSchedule =
  | { mode: "interval"; everySecs: number; everyMaxSecs?: number }
  | {
      mode: "calendar";
      atMinutes: number;
      days: Weekday[];
      untilMinutes?: number;
      times?: number;
      pickDays?: number;
    }
  | { mode: "manual" };

// Which config layer defines the job: the project registry file, the repo's
// .lpm.yml, or ~/.lpm/global.yml (applies to every project).
export type JobSourceLayer = "project" | "repo" | "global";

export interface JobInfo {
  id: string;
  valid: boolean;
  source?: JobSourceLayer;
  error?: string;
  label?: string;
  emoji?: string;
  description?: string;
  enabled: boolean;
  duplicate?: boolean;
  runKind?: JobRunKind;
  schedule?: JobSchedule;
  lastRunAt?: number;
  lastResult?: string;
  nextFireAt?: number;
  running?: boolean;
  runningSince?: number;
  agent?: string;
  model?: string;
  effort?: string;
  // Shared (global-layer) jobs only: which projects the job runs in (empty for a
  // standalone job), whether it's standalone, and the aggregate run counts folded
  // across its targets.
  targets?: string[];
  standalone?: boolean;
  targetCount?: number;
  runningCount?: number;
  // Runs that landed since the user last opened the job, folded across its
  // projects for a shared job.
  unread?: number;
}

export const STANDALONE_PROJECT_LABEL = "No project";
export const MULTI_PROJECT_LABEL = "Multiple projects";

// The projects a job runs in — none for a standalone job. `targets` is absent
// on project- and repo-layer jobs, which arrive stamped with `project` instead.
export function jobTargets(job: JobInfo & { project?: string }): string[] {
  if (job.standalone) return [];
  return job.targets ?? (job.project ? [job.project] : []);
}

// Where a removal takes the job from: "from Foo", "from all 3 projects it runs
// in", or nothing at all for a job that runs in no project. `label` resolves a
// project name for display.
export function jobScopePhrase(
  job: JobInfo & { project?: string },
  label: (name: string) => string,
): string {
  const targets = jobTargets(job);
  if (targets.length === 0) return "";
  if (targets.length === 1) return `from ${label(targets[0])}`;
  return `from all ${targets.length} projects it runs in`;
}

export interface JobHistoryEntry {
  at: number;
  result: string;
  // How many consecutive identical outcomes this entry stands for (quiet
  // checks and skips collapse into one counted entry).
  count?: number;
  copy?: string;
  output?: string;
  durationSecs?: number;
  costUsd?: number;
  session?: string;
  resumed?: string;
  // The `at` of the entry this reply followed — threading that works without
  // an agent session.
  follows?: number;
  question?: string;
  compacted?: boolean;
  // Whether the job's after-the-run check passed. Undefined means the job
  // declares no check, or there was no live run to check — unverified, which is
  // not the same as failed.
  verified?: boolean;
  verifyOutput?: string;
}

// One run and the conversation that grew out of it: the scheduled (or manual)
// run is the root, replies chain onto it via the session each one continued.
export interface JobThread {
  root: JobHistoryEntry;
  replies: JobHistoryEntry[];
}

export function groupJobThreads(entries: JobHistoryEntry[]): JobThread[] {
  const threads: JobThread[] = [];
  const bySession = new Map<string, JobThread>();
  const byAt = new Map<number, JobThread>();
  for (const entry of entries) {
    const parent =
      (entry.resumed ? bySession.get(entry.resumed) : undefined) ??
      (entry.follows !== undefined ? byAt.get(entry.follows) : undefined);
    const thread = parent ?? { root: entry, replies: [] };
    if (parent) parent.replies.push(entry);
    else threads.push(thread);
    if (entry.session) bySession.set(entry.session, thread);
    byAt.set(entry.at, thread);
  }
  return threads;
}

// The thread's newest message — what a reply continues from.
export function jobThreadTail(thread: JobThread): JobHistoryEntry {
  return thread.replies[thread.replies.length - 1] ?? thread.root;
}

// Result strings emitted by the backend pipeline (jobs.rs).
export type JobResult =
  | "nothing-to-do"
  | "found-work"
  | "completed"
  | "error"
  | "canceled"
  | "timed-out"
  | "context-full"
  | "skipped-overlap"
  | "skipped-pending-copy"
  | "skipped-capacity"
  | "pending-window";

export type JobResultTone = "neutral" | "success" | "error" | "warning";

interface ResultMeta {
  // Short outcome for a history row / last-run line.
  label: (copy?: string) => string;
  tone: JobResultTone;
}

const RESULT_META: Record<string, ResultMeta> = {
  "nothing-to-do": { label: () => "Nothing to do", tone: "neutral" },
  "found-work": {
    label: (copy) => (copy ? `Found work — running in ${copy}` : "Found work — running"),
    tone: "success",
  },
  completed: { label: () => "Done", tone: "success" },
  error: { label: () => "Problem during the run", tone: "error" },
  canceled: { label: () => "Stopped", tone: "neutral" },
  "timed-out": { label: () => "Stopped — ran too long", tone: "error" },
  "context-full": { label: () => "Conversation full", tone: "warning" },
  "skipped-overlap": { label: () => "Skipped — still running", tone: "warning" },
  "skipped-pending-copy": {
    label: () => "Waiting — the copy from the last run is still open",
    tone: "warning",
  },
  "skipped-capacity": {
    label: () => "Waiting — other automations were running",
    tone: "warning",
  },
  "pending-window": { label: () => "Waiting for the app window", tone: "warning" },
};

export function jobResultLabel(result: string | undefined, copy?: string): string {
  if (!result) return "";
  return RESULT_META[result]?.label(copy) ?? result;
}

// What a finished run is called once its own check has had a say. "Done" on its
// own says the agent exited, not that it did what it was asked.
export function jobEntryLabel(entry: JobHistoryEntry): string {
  const base = jobResultLabel(entry.result, entry.copy);
  if (entry.result !== "completed" || entry.verified === undefined) return base;
  return entry.verified ? `${base} — checks passed` : `${base} — checks failed`;
}

export function jobResultTone(result: string | undefined): JobResultTone {
  if (!result) return "neutral";
  return RESULT_META[result]?.tone ?? "neutral";
}

// Status-dot classes shared by the job list and history so every surface speaks
// the same color language for run outcomes.
export const TONE_DOT_CLASS: Record<JobResultTone, string> = {
  neutral: "bg-[var(--text-muted)]",
  success: "bg-[var(--accent-cyan)]",
  error: "bg-[var(--accent-red)]",
  warning: "bg-[var(--accent-amber)]",
};

// A blocked-on-pending-copy job is the one loud "stuck" state worth calling out
// on the row itself, so the list surfaces it directly.
export function isBlockedResult(result: string | undefined): boolean {
  return result === "skipped-pending-copy";
}

// "Running" under a minute, then "Running — 4m" / "Running — 1h 12m".
// `sinceSecs` is a unix timestamp; `nowMs` is injectable for tests.
export function formatRunningFor(
  sinceSecs: number | undefined,
  nowMs: number = Date.now(),
): string {
  const elapsed = sinceSecs ? Math.floor(nowMs / 1000) - sinceSecs : 0;
  if (elapsed < 60) return "Running";
  const mins = Math.floor(elapsed / 60);
  if (mins < 60) return `Running — ${mins}m`;
  return `Running — ${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// One-line plain-text preview of a run's output for list rows: markdown
// dressing stripped, whitespace collapsed, tail elided.
export function jobOutputSnippet(output: string | undefined, max = 160): string {
  if (!output) return "";
  const flat = output
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>`|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length <= max ? flat : `${flat.slice(0, max).trimEnd()}…`;
}

// The last few lines of a live run's log, cleaned for display: terminal
// escape codes stripped, trailing blank lines dropped, capped to `maxLines`.
export function liveOutputTail(text: string | undefined, maxLines = 12): string {
  if (!text) return "";
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r/g, "");
  const lines = clean.split("\n").map((l) => l.trimEnd());
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.slice(-maxLines).join("\n");
}

// "12s", "4m", "4m 30s", "1h 12m" — how long a run took.
export function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.max(0, Math.round(secs))}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) {
    const rest = Math.round(secs % 60);
    return rest > 0 ? `${mins}m ${rest}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

// "$0.42" — what a run cost, when the agent reported it.
export function formatCost(usd: number): string {
  if (usd < 0.005) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatMinutes(atMinutes: number): string {
  const h = Math.floor(atMinutes / 60);
  const m = atMinutes % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function orderDays(days: Weekday[]): Weekday[] {
  return WEEKDAYS.filter((d) => days.includes(d));
}

// "Mondays", "Mondays and Thursdays", "Mondays, Wednesdays and Fridays".
function joinDayPhrase(days: Weekday[]): string {
  const named = orderDays(days).map((d) => DAY_PLURAL[d]);
  if (named.length === 0) return "";
  if (named.length === 1) return named[0];
  return `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}

// Which days a calendar schedule runs on: "every day", "Mondays and Thursdays",
// "2 random weekdays". Lower case — the caller capitalizes when it leads.
function dayPhrase(days: Weekday[], pickDays?: number): string {
  const all = days.length === 0 || days.length === 7;
  if (!pickDays) return all ? "every day" : joinDayPhrase(days);
  return `${pickDays} random ${dayPoolNoun(days, pickDays)} a week`;
}

// What to call the days a random pick is drawn from, so "2 random weekdays"
// beats "2 random days out of Mondays, Tuesdays, ...".
function dayPoolNoun(days: Weekday[], count: number): string {
  const set = new Set(days);
  const same = (names: Weekday[]) =>
    set.size === names.length && names.every((d) => set.has(d));
  const s = count === 1 ? "" : "s";
  if (same(["mon", "tue", "wed", "thu", "fri"])) return `weekday${s}`;
  if (same(["sat", "sun"])) return `weekend day${s}`;
  return `day${s}`;
}

// When in the day it runs: "at 09:00", or "between 09:00 and 17:00" when the
// time is drawn from a window.
function timePhrase(atMinutes: number, untilMinutes?: number): string {
  const at = formatMinutes(atMinutes);
  if (untilMinutes === undefined) return `at ${at}`;
  return `between ${at} and ${formatMinutes(untilMinutes)}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Plain-language schedule: "Every day at 09:00", "Mondays and Thursdays at
// 09:00", "Every 6 hours", "Every 4–8 hours", "Every day between 09:00 and
// 17:00", "3 times a day between 09:00 and 17:00", "2 random weekdays at 09:00".
export function formatSchedule(schedule: JobSchedule): string {
  if (schedule.mode === "manual") {
    return "Manual";
  }
  if (schedule.mode === "interval") {
    return formatInterval(schedule.everySecs, schedule.everyMaxSecs);
  }
  const days = dayPhrase(schedule.days, schedule.pickDays);
  const time = timePhrase(schedule.atMinutes, schedule.untilMinutes);
  const times = schedule.times ?? 1;
  if (times > 1) {
    const where = days === "every day" ? "a day" : `on ${days}`;
    return `${times} times ${where} ${time}`;
  }
  return `${capitalize(days)} ${time}`;
}

// "6 hours" / "30 minutes" / "2 days" — the number and its unit, sized to the
// value so a gap reads the way it was written.
function intervalParts(secs: number): { value: number; unit: string } {
  if (secs > 0 && secs % 86400 === 0) {
    return { value: secs / 86400, unit: "day" };
  }
  if (secs > 0 && secs < 3600) {
    return { value: Math.max(1, Math.round(secs / 60)), unit: "minute" };
  }
  return { value: Math.max(1, Math.round(secs / 3600)), unit: "hour" };
}

function plural(value: number, unit: string): string {
  return value === 1 ? unit : `${unit}s`;
}

// "Every 6 hours" / "Every day", or "Every 4–8 hours" for a gap drawn from a
// band. A band whose ends don't share a unit is spelled out on both sides.
export function formatInterval(everySecs: number, everyMaxSecs?: number): string {
  const lo = intervalParts(everySecs);
  if (everyMaxSecs === undefined || everyMaxSecs <= everySecs) {
    if (lo.value === 1) return `Every ${lo.unit}`;
    return `Every ${lo.value} ${plural(lo.value, lo.unit)}`;
  }
  const hi = intervalParts(everyMaxSecs);
  if (lo.unit === hi.unit) {
    return `Every ${lo.value}–${hi.value} ${plural(hi.value, hi.unit)}`;
  }
  return `Every ${lo.value} ${plural(lo.value, lo.unit)} to ${hi.value} ${plural(hi.value, hi.unit)}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// "Next run today at 09:00" / "tomorrow at 09:00" / "Monday at 09:00" /
// "on Jul 20 at 09:00". `now` is injectable for tests.
export function formatNextRun(
  nextFireAt: number | undefined,
  now: Date = new Date(),
): string {
  if (!nextFireAt) return "";
  const at = new Date(nextFireAt * 1000);
  // An overdue fire point means the scheduler is about to pick it up — a
  // timestamp in the past would read as a bug.
  if (at.getTime() <= now.getTime()) return "Next run in a moment";
  const time = `${pad2(at.getHours())}:${pad2(at.getMinutes())}`;

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  let when: string;
  if (sameDay(at, now)) {
    when = "today";
  } else if (sameDay(at, tomorrow)) {
    when = "tomorrow";
  } else {
    const diffDays = Math.round((at.getTime() - now.getTime()) / 86400000);
    if (diffDays >= 2 && diffDays < 7) {
      when = at.toLocaleDateString(undefined, { weekday: "long" });
    } else {
      when = `on ${at.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    }
  }
  return `Next run ${when} at ${time}`;
}

// ---- editor draft <-> YAML payload -----------------------------------------

export type ScheduleMode = "time" | "interval" | "manual";

export type DuplicateMode = "none" | "copy" | "worktree";
export type IntervalUnit = "minutes" | "hours" | "days";

export interface JobDraft {
  label: string;
  emoji: string;
  scheduleMode: ScheduleMode;
  time: string;
  days: Weekday[];
  // Randomized timing. Each is gated by its own toggle so turning one off and
  // back on doesn't lose what was typed into it: `randomWindow` draws the run
  // time from `time`..`untilTime` and spreads `timesPerDay` runs across it,
  // `randomDays` uses only `pickDays` of the selected days each week, and
  // `varyInterval` draws each gap from `intervalValue`..`intervalMaxValue`.
  randomWindow: boolean;
  untilTime: string;
  timesPerDay: number;
  randomDays: boolean;
  pickDays: number;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  varyInterval: boolean;
  intervalMaxValue: number;
  check: string;
  // Run after the agent exits: it decides whether the run is reported as having
  // worked. Empty = the run is unverified.
  verify: string;
  // Where the run happens: in the project itself, in a fresh copy of it, or in
  // a Git worktree of it. A standalone job has no project to copy.
  duplicateMode: DuplicateMode;
  // Copy options, `null` meaning "leave it at the default". They have no editor
  // control yet, so they are carried through a save untouched.
  duplicatePullLatest: boolean | null;
  duplicateReinstallDeps: boolean | null;
  duplicateExcludeUncommitted: boolean | null;
  runMode: JobRunKind;
  action: string;
  cmd: string;
  prompt: ComposerValue;
  // Which agent CLI runs a prompt job and with which model; both empty = the
  // app's default agent with its default model. `effort` is the reasoning
  // effort (Claude/Codex only); empty = the model's default. `access` is
  // "full" (the agent can edit files and run commands unattended) or "read"
  // (look around and report only).
  agent: string;
  model: string;
  effort: string;
  access: "full" | "read";
  // The projects the job runs in (empty = standalone). `everyProject` marks a
  // legacy job that runs wherever projects exist: the editor preserves it, but
  // never sets it — the picker only names concrete projects.
  targets: string[];
  everyProject: boolean;
}

export function defaultJobDraft(): JobDraft {
  return {
    label: "",
    emoji: "",
    scheduleMode: "time",
    time: "09:00",
    days: [],
    randomWindow: false,
    untilTime: "17:00",
    timesPerDay: 1,
    randomDays: false,
    pickDays: 1,
    intervalValue: 6,
    intervalUnit: "hours",
    varyInterval: false,
    intervalMaxValue: 12,
    check: "",
    verify: "",
    duplicateMode: "none",
    duplicatePullLatest: null,
    duplicateReinstallDeps: null,
    duplicateExcludeUncommitted: null,
    runMode: "prompt",
    action: "",
    cmd: "",
    prompt: EMPTY_COMPOSER,
    agent: "",
    model: "",
    effort: "",
    access: "full",
    targets: [],
    everyProject: false,
  };
}

function parseTimeToMinutes(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// The editor's live "when it runs" summary, derived from the draft alone.
export function describeDraftSchedule(draft: JobDraft): string {
  if (draft.scheduleMode === "manual") {
    return "Runs only when you start it";
  }
  if (draft.scheduleMode === "interval") {
    return formatInterval(intervalSecs(draft), intervalMaxSecs(draft));
  }
  const minutes = parseTimeToMinutes(draft.time);
  if (minutes === null) return "";
  const until = draftUntilMinutes(draft);
  if (draft.randomWindow && until === null) return "";
  return formatSchedule({
    mode: "calendar",
    atMinutes: minutes,
    days: draft.days,
    untilMinutes: until ?? undefined,
    times: draft.randomWindow ? Math.max(1, draft.timesPerDay) : 1,
    pickDays: draftPickDays(draft),
  });
}

// The window's end, or null when the draft isn't using one (or hasn't typed a
// valid time into it yet).
function draftUntilMinutes(draft: JobDraft): number | null {
  if (!draft.randomWindow) return null;
  return parseTimeToMinutes(draft.untilTime);
}

// How many days a week the draft picks, or undefined when it uses all of them.
// A pick wider than the days now selected is clamped rather than refused: the
// control disappears once a single day is left, so an error there would be
// unfixable, and "1 of [Monday]" is exactly "every Monday" anyway.
function draftPickDays(draft: JobDraft): number | undefined {
  if (!draft.randomDays || draft.pickDays < 1) return undefined;
  const pool = draft.days.length === 0 ? 7 : draft.days.length;
  return draft.pickDays >= pool ? undefined : draft.pickDays;
}

const UNIT_SECS: Record<IntervalUnit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86400,
};

// The scheduler's floor (jobs.rs MIN_INTERVAL_SECS).
const MIN_INTERVAL_SECS = 300;

function intervalSecs(draft: JobDraft): number {
  return draft.intervalValue * UNIT_SECS[draft.intervalUnit];
}

// The far end of a varying gap, or undefined for a fixed one. Both ends share
// the draft's single unit, so only the number differs.
function intervalMaxSecs(draft: JobDraft): number | undefined {
  if (!draft.varyInterval) return undefined;
  return draft.intervalMaxValue * UNIT_SECS[draft.intervalUnit];
}

// Mirrors the backend validation (jobs.rs) so save is blocked before a write
// that the scheduler would reject, and the message reads in product terms.
export function validateJobDraft(
  draft: JobDraft,
  standalone = false,
): string | null {
  if (!draft.label.trim()) return "Give this job a name.";
  if (standalone && draft.runMode === "action") {
    return "Standalone jobs can't run an action.";
  }
  if (draft.scheduleMode === "time") {
    const at = parseTimeToMinutes(draft.time);
    if (at === null) return "Pick a valid time.";
    if (draft.randomWindow) {
      const until = parseTimeToMinutes(draft.untilTime);
      if (until === null) return "Pick a valid time for the end of the window.";
      if (until <= at) return "The window has to end after it starts.";
      const times = Math.max(1, draft.timesPerDay);
      if (((until - at) * 60) / times < MIN_INTERVAL_SECS) {
        return "That's more runs than the window has room for.";
      }
    }
    if (draft.randomDays && draft.pickDays < 1) return "Pick at least one day.";
  } else if (draft.scheduleMode === "interval") {
    if (!Number.isFinite(draft.intervalValue) || draft.intervalValue < 1) {
      return "The interval must be at least 1.";
    }
    if (intervalSecs(draft) < MIN_INTERVAL_SECS) {
      return "The interval must be at least 5 minutes.";
    }
    if (draft.varyInterval && draft.intervalMaxValue < draft.intervalValue) {
      return "The longest gap has to be at least the shortest.";
    }
  }
  if (draft.verify.trim() && draft.runMode === "action") {
    return "A check after the run isn't available for actions.";
  }
  if (draft.runMode === "action" && !draft.action.trim()) {
    return "Choose an action to run.";
  }
  if (draft.runMode === "cmd" && !draft.cmd.trim()) {
    return "Enter a command to run.";
  }
  if (draft.runMode === "prompt" && !draft.prompt.text.trim()) {
    return "Enter a prompt to run.";
  }
  return null;
}

function buildScheduleBlock(draft: JobDraft): Record<string, unknown> {
  if (draft.scheduleMode === "manual") {
    return { manual: true };
  }
  if (draft.scheduleMode === "interval") {
    const suffix = { minutes: "m", hours: "h", days: "d" }[draft.intervalUnit];
    const vary =
      draft.varyInterval && draft.intervalMaxValue > draft.intervalValue;
    const every = vary
      ? `${draft.intervalValue}-${draft.intervalMaxValue}${suffix}`
      : `${draft.intervalValue}${suffix}`;
    return { every };
  }
  const block: Record<string, unknown> = { at: draft.time.trim() };
  if (draft.randomWindow) {
    block.until = draft.untilTime.trim();
    if (draft.timesPerDay > 1) block.times = draft.timesPerDay;
  }
  if (draft.days.length > 0 && draft.days.length < 7) {
    block.days = orderDays(draft.days);
  }
  const pickDays = draftPickDays(draft);
  if (pickDays !== undefined) block.pickDays = pickDays;
  return block;
}

function buildRunBlock(draft: JobDraft): Record<string, unknown> {
  if (draft.runMode === "action") return { action: draft.action.trim() };
  if (draft.runMode === "cmd") return { cmd: draft.cmd.trim() };
  const block: Record<string, unknown> = {
    prompt: composerValueToText(draft.prompt),
  };
  if (draft.agent.trim()) block.agent = draft.agent.trim();
  if (draft.model.trim()) block.model = draft.model.trim();
  if (draft.effort.trim()) block.effort = draft.effort.trim();
  if (draft.access === "read") block.access = "read";
  return block;
}

// A plain copy with default options keeps writing `duplicate: true`, the form
// every build can read — the options mapping is only written once a setting
// actually departs from the default.
function buildDuplicateValue(draft: JobDraft): unknown {
  if (draft.duplicateMode === "none") return null;
  const options: Record<string, unknown> = {};
  if (draft.duplicateMode === "worktree") {
    options.mode = "worktree";
  } else {
    if (draft.duplicatePullLatest !== null)
      options.pullLatest = draft.duplicatePullLatest;
    if (draft.duplicateExcludeUncommitted !== null)
      options.excludeUncommitted = draft.duplicateExcludeUncommitted;
  }
  if (draft.duplicateReinstallDeps !== null)
    options.reinstallDeps = draft.duplicateReinstallDeps;
  return Object.keys(options).length === 0 ? true : options;
}

function asBoolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readDuplicateInto(draft: JobDraft, value: unknown): void {
  if (value === true) {
    draft.duplicateMode = "copy";
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const options = value as Record<string, unknown>;
  draft.duplicateMode = options.mode === "worktree" ? "worktree" : "copy";
  draft.duplicatePullLatest = asBoolOrNull(options.pullLatest);
  draft.duplicateReinstallDeps = asBoolOrNull(options.reinstallDeps);
  draft.duplicateExcludeUncommitted = asBoolOrNull(options.excludeUncommitted);
}

// The YAML mapping written under `jobs: <id>:`. Optional fields are omitted when
// empty so a clean job stays terse (matching how actions are serialized).
export function buildJobPayload(draft: JobDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = { label: draft.label.trim() };
  if (draft.emoji.trim()) payload.emoji = draft.emoji.trim();
  payload.schedule = buildScheduleBlock(draft);
  if (draft.check.trim()) payload.check = draft.check.trim();
  if (draft.verify.trim()) payload.verify = draft.verify.trim();
  const duplicate = buildDuplicateValue(draft);
  if (duplicate !== null) payload.duplicate = duplicate;
  payload.run = buildRunBlock(draft);
  return payload;
}

// `every` is "6h" / "2d" / a bare number read as hours, or a band ("4h-8h",
// "4-8h") whose ends may share one unit written on the far side.
function parseEvery(every: unknown): {
  value: number;
  unit: IntervalUnit;
  maxValue?: number;
} {
  if (typeof every === "number") {
    return { value: Math.max(1, Math.round(every)), unit: "hours" };
  }
  const s = String(every ?? "").trim().toLowerCase();
  const m = /^(\d+)\s*([mhd]?)(?:\s*-\s*(\d+)\s*([mhd]?))?$/.exec(s);
  if (!m) return { value: 6, unit: "hours" };
  const value = Math.max(1, Number(m[1]));
  // Both ends share the draft's one unit; the far end's is the one written.
  const suffix = m[3] !== undefined ? m[4] || m[2] : m[2];
  const unit: IntervalUnit =
    suffix === "d" ? "days" : suffix === "m" ? "minutes" : "hours";
  if (m[3] === undefined) return { value, unit };
  return { value, unit, maxValue: Math.max(value, Number(m[3])) };
}

function asStringArray(value: unknown): Weekday[] {
  if (!Array.isArray(value)) return [];
  const set = new Set(value.map((v) => String(v).trim().toLowerCase()));
  return WEEKDAYS.filter((d) => set.has(d));
}

// Reverse of buildJobPayload: seed the editor from an existing job's YAML body.
// Unknown / partial shapes fall back to the defaults so the editor always opens
// in a sane state.
export function payloadToDraft(payload: Record<string, unknown>): JobDraft {
  const draft = defaultJobDraft();
  if (typeof payload.label === "string") draft.label = payload.label;
  if (typeof payload.emoji === "string") draft.emoji = payload.emoji;
  if (typeof payload.verify === "string") draft.verify = payload.verify;
  readDuplicateInto(draft, payload.duplicate);

  const schedule = payload.schedule;
  if (schedule && typeof schedule === "object") {
    const s = schedule as Record<string, unknown>;
    if (s.manual === true) {
      draft.scheduleMode = "manual";
    } else if (s.every !== undefined && s.every !== null) {
      const { value, unit, maxValue } = parseEvery(s.every);
      draft.scheduleMode = "interval";
      draft.intervalValue = value;
      draft.intervalUnit = unit;
      if (maxValue !== undefined && maxValue > value) {
        draft.varyInterval = true;
        draft.intervalMaxValue = maxValue;
      }
    } else {
      draft.scheduleMode = "time";
      if (typeof s.at === "string" && s.at.trim()) draft.time = s.at.trim();
      draft.days = asStringArray(s.days);
      if (typeof s.until === "string" && s.until.trim()) {
        draft.randomWindow = true;
        draft.untilTime = s.until.trim();
        const times = Number(s.times);
        if (Number.isFinite(times) && times > 1) {
          draft.timesPerDay = Math.floor(times);
        }
      }
      const pickDays = Number(s.pickDays);
      if (Number.isFinite(pickDays) && pickDays >= 1) {
        draft.randomDays = true;
        draft.pickDays = Math.floor(pickDays);
      }
    }
  }

  const run = payload.run;
  if (run && typeof run === "object") {
    const r = run as Record<string, unknown>;
    if (typeof r.action === "string" && r.action.trim()) {
      draft.runMode = "action";
      draft.action = r.action.trim();
    } else if (typeof r.cmd === "string" && r.cmd.trim()) {
      draft.runMode = "cmd";
      draft.cmd = r.cmd.trim();
    } else if (typeof r.prompt === "string") {
      draft.runMode = "prompt";
      draft.prompt = textToPrompt(r.prompt);
      if (typeof r.agent === "string") draft.agent = r.agent.trim().toLowerCase();
      if (typeof r.model === "string") draft.model = r.model.trim();
      if (typeof r.effort === "string") draft.effort = r.effort.trim().toLowerCase();
      if (typeof r.access === "string" && r.access.trim().toLowerCase() === "read") {
        draft.access = "read";
      }
    }
  }

  if (typeof payload.check === "string") draft.check = payload.check;
  if (Array.isArray(payload.projects)) {
    draft.targets = payload.projects.map((p) => String(p));
  }
  return draft;
}
