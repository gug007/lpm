// Pure formatting and draft/payload helpers for scheduled jobs. Kept free of
// React and the bridge so the schedule <-> human-string mapping and the YAML
// jobs-block round-trip can be unit tested directly.

import { composerValueToText, EMPTY_COMPOSER, textToPrompt } from "./composerValue";
import type { ComposerValue } from "./composerValue";
import { isOpenAsk, WAITING_LABEL, type JobAsk } from "./jobAsk";
import { describeCronText } from "./cronDescribe";
import { DEFAULT_SEND_TO, readSendTo, writeSendTo } from "./sendTo";
import { readMachines } from "./jobsMachines";
import {
  dateRulePhrase,
  hasDateRule,
  isOnce,
  type DateRuleFields,
  type NthOf,
  type NthWord,
} from "./jobsScheduleRules";
import {
  draftToSchedule,
  readScheduleIntoDraft,
  scheduleBlockFromDraft,
  validateDraftSchedule,
} from "./jobsScheduleDraft";
import { WEEKDAYS, type Weekday } from "./weekdays";

export { WEEKDAYS, type Weekday };

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
// `alsoAtMinutes` adds further fixed times, and the date-rule fields replace
// `days` with dates of the month, a position in it, or calendar dates. An
// interval's `fromMinutes`..`untilMinutes` and `days` hold it to those hours.
// A cron schedule is the five-field line as written.
export type JobSchedule =
  | {
      mode: "interval";
      everySecs: number;
      everyMaxSecs?: number;
      fromMinutes?: number;
      untilMinutes?: number;
      days?: Weekday[];
    }
  | ({
      mode: "calendar";
      atMinutes: number;
      alsoAtMinutes?: number[];
      days: Weekday[];
      untilMinutes?: number;
      times?: number;
      pickDays?: number;
    } & DateRuleFields)
  | { mode: "cron"; cron: string }
  | { mode: "manual" };

// Which config layer defines the job: the project registry file, the repo's
// .lpm.yml, or ~/.lpm/global.yml (applies to every project).
export type JobSourceLayer = "project" | "repo" | "global";

export interface JobInfo {
  id: string;
  valid: boolean;
  // The paired machine the job lives on, by slug; absent = this one. Its project
  // names arrive peer-marked, so commands about them reach that machine.
  host?: string;
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
  // The head of the newest run answer or reply, for the list's preview line.
  lastMessage?: string;
  // The question the job is waiting on the user to answer.
  ask?: JobAsk;
  // The computers the job may run on, best first, named as the computer
  // listing it knows them, and whether any other one may after them. Absent
  // on a job every computer that has it runs.
  machines?: JobMachine[];
  anyMachine?: boolean;
  // The hostId of the computer this row comes from, on a job that names its
  // computers.
  machineId?: string;
}

export interface JobMachine {
  id: string;
  name: string;
  here?: boolean;
}

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
  // The run landed after the user last opened this job — still unread.
  unread?: boolean;
  // Whether the job's after-the-run check passed. Undefined means the job
  // declares no check, or there was no live run to check — unverified, which is
  // not the same as failed.
  verified?: boolean;
  verifyOutput?: string;
  // What the run asked the user, with the answers once given.
  asks?: JobAsk[];
  // The question this entry's message answered — the entry that asked shows
  // the answer, so it isn't repeated as a message.
  answerTo?: string;
  // The computer that made this run when it wasn't this one: another of the
  // job's computers ran it while this one was off.
  ranOn?: string;
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

// A run is unread until the job is opened, and a reply that landed since keeps
// the whole run unread — the conversation is what the user came to read.
export function isThreadUnread(thread: JobThread): boolean {
  return thread.root.unread === true || thread.replies.some((r) => r.unread);
}

// A question somewhere in the conversation still waits for an answer.
export function isThreadWaiting(thread: JobThread): boolean {
  return isEntryWaiting(thread.root) || thread.replies.some(isEntryWaiting);
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
  if (isEntryWaiting(entry)) return WAITING_LABEL;
  const base = jobResultLabel(entry.result, entry.copy);
  if (entry.result !== "completed" || entry.verified === undefined) return base;
  return entry.verified ? `${base} — checks passed` : `${base} — checks failed`;
}

// The entry asked the user something that's still unanswered.
export function isEntryWaiting(entry: JobHistoryEntry): boolean {
  return entry.asks?.some(isOpenAsk) === true;
}

// How an entry reads at a glance: a question still open outranks how the run
// itself ended.
export function jobEntryTone(entry: JobHistoryEntry): JobResultTone {
  return isEntryWaiting(entry) ? "warning" : jobResultTone(entry.result);
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
// Codex wraps its web citations in private-use characters
// (`citeturn3view0`) that only its own UI understands —
// anywhere else they render as boxes.
export function stripCitationMarkers(text: string): string {
  return text
    .replace(/[ \t]*[^]*/g, "")
    .replace(/[-]/g, "");
}

export function jobOutputSnippet(output: string | undefined, max = 160): string {
  if (!output) return "";
  const flat = stripCitationMarkers(output)
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

/** "45s", "4m", "2h 5m" — `formatDuration` with the remainder dropped, for a
 *  column with room for a reading rather than a stopwatch. Takes millis, and
 *  rounds down like a stopwatch: it says what has elapsed, never more. */
export function shortDuration(millis: number): string {
  const secs = Math.max(0, Math.floor(millis / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
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

// "Mondays", "Mondays and Thursdays", "Mondays, Wednesdays and Fridays",
// "weekdays".
function joinDayPhrase(days: Weekday[]): string {
  const key = orderDays(days).join(",");
  if (key === "mon,tue,wed,thu,fri") return "weekdays";
  if (key === "sat,sun") return "weekends";
  const named = orderDays(days).map((d) => DAY_PLURAL[d]);
  if (named.length === 0) return "";
  if (named.length === 1) return named[0];
  return `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}

// Which days a calendar schedule runs on: "every day", "Mondays and Thursdays",
// "2 random weekdays". Lower case — the caller capitalizes when it leads.
export function dayPhrase(days: Weekday[], pickDays?: number): string {
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

// When in the day it runs: "at 09:00", "at 09:00 and 17:30", or "between 09:00
// and 17:00" when the time is drawn from a window.
export function timePhrase(atMinutes: number, untilMinutes?: number, alsoAt: number[] = []): string {
  const at = formatMinutes(atMinutes);
  if (untilMinutes === undefined) {
    const all = [at, ...alsoAt.map(formatMinutes)];
    return `at ${all.length === 1 ? at : `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]}`}`;
  }
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
  if (schedule.mode === "cron") {
    return describeCronText(schedule.cron) ?? `Cron ${schedule.cron}`;
  }
  if (schedule.mode === "interval") {
    return formatInterval(schedule.everySecs, schedule.everyMaxSecs) + intervalLimitsPhrase(schedule);
  }
  const time = timePhrase(schedule.atMinutes, schedule.untilMinutes, schedule.alsoAtMinutes);
  const times = schedule.times ?? 1;
  if (hasDateRule(schedule)) {
    const rule = dateRulePhrase(schedule);
    if (times > 1) return `${times} times ${rule} ${time}`;
    if (isOnce(schedule)) return `Once, ${rule} ${time}`;
    return `${capitalize(rule)} ${time}`;
  }
  const days = dayPhrase(schedule.days, schedule.pickDays);
  if (times > 1) {
    const where = days === "every day" ? "a day" : `on ${days}`;
    return `${times} times ${where} ${time}`;
  }
  return `${capitalize(days)} ${time}`;
}

// " between 09:00 and 18:00 on weekdays" — the hours and days an interval is
// held to, or nothing when it may run at any time.
function intervalLimitsPhrase(schedule: Extract<JobSchedule, { mode: "interval" }>): string {
  let out = "";
  if (schedule.fromMinutes !== undefined && schedule.untilMinutes !== undefined) {
    out += ` between ${formatMinutes(schedule.fromMinutes)} and ${formatMinutes(schedule.untilMinutes)}`;
  }
  const days = schedule.days ?? [];
  if (days.length > 0 && days.length < 7) out += ` on ${dayPhrase(days)}`;
  return out;
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

// How the schedule is written: with the form's controls, or as a cron line.
export type ScheduleKind = "form" | "cron";

// Which days a time-of-day job runs on: weekdays (`days`, empty = every day),
// dates of the month, a position in the month, or one calendar date.
export type DayRule = "week" | "dates" | "nth" | "once";

export type DuplicateMode = "none" | "copy" | "worktree";
export type IntervalUnit = "minutes" | "hours" | "days";

export interface JobDraft {
  label: string;
  emoji: string;
  // The form's fields stay put while the cron line is in use, so switching
  // back and forth doesn't lose either.
  scheduleKind: ScheduleKind;
  cron: string;
  scheduleMode: ScheduleMode;
  time: string;
  // Further fixed times on the same days; unused while the time is drawn from
  // a window.
  moreTimes: string[];
  dayRule: DayRule;
  days: Weekday[];
  monthDates: number[];
  lastDay: boolean;
  // A picked date a short month lacks: run on its last day, or skip the month.
  shortMonths: "skip" | "last";
  nth: NthWord;
  nthOf: NthOf;
  onceDate: string;
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
  // The hours (`intervalFrom`..`intervalUntil`) and weekdays an interval job is
  // held to; empty days = every day.
  intervalWindow: boolean;
  intervalFrom: string;
  intervalUntil: string;
  intervalDays: Weekday[];
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
  // Report only runs that found something; a prompt run that finds nothing
  // leaves no trace.
  quiet: boolean;
  // Every run recalls and saves the job's lpm-memory session, so it knows what
  // earlier runs did and found. On for a new job; needs full access to save.
  memory: boolean;
  // Where the job's results go (see sendTo.ts); lpm alone by default.
  sendTo: string[];
  // The projects the job runs in (empty = standalone). `everyProject` marks a
  // legacy job that runs wherever projects exist: the editor preserves it, but
  // never sets it — the picker only names concrete projects.
  targets: string[];
  everyProject: boolean;
  // The computers the job may run on, by hostId, best first; "any" last lets
  // any other one run it after them. Empty = every computer that has it, the
  // way automations ran before they named their computers.
  machines: string[];
}

export function defaultJobDraft(): JobDraft {
  return {
    label: "",
    emoji: "",
    scheduleKind: "form",
    cron: "",
    scheduleMode: "time",
    time: "09:00",
    moreTimes: [],
    dayRule: "week",
    days: [],
    monthDates: [1],
    lastDay: false,
    shortMonths: "skip",
    nth: "first",
    nthOf: "mon",
    onceDate: "",
    randomWindow: false,
    untilTime: "17:00",
    timesPerDay: 1,
    randomDays: false,
    pickDays: 1,
    intervalValue: 6,
    intervalUnit: "hours",
    varyInterval: false,
    intervalMaxValue: 12,
    intervalWindow: false,
    intervalFrom: "09:00",
    intervalUntil: "18:00",
    intervalDays: [],
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
    quiet: false,
    memory: true,
    sendTo: [...DEFAULT_SEND_TO],
    targets: [],
    everyProject: false,
    machines: [],
  };
}

// The editor's live "when it runs" summary, derived from the draft alone.
export function describeDraftSchedule(draft: JobDraft): string {
  if (draft.scheduleKind === "form" && draft.scheduleMode === "manual") {
    return "Runs only when you start it";
  }
  const schedule = draftToSchedule(draft);
  return schedule ? formatSchedule(schedule) : "";
}

export function validateJobDraft(
  draft: JobDraft,
  standalone = false,
): string | null {
  if (!draft.label.trim()) return "Give this automation a name.";
  if (standalone && draft.runMode === "action") {
    return "A standalone automation can't run an action.";
  }
  const scheduleError = validateDraftSchedule(draft);
  if (scheduleError) return scheduleError;
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
  if (draft.sendTo.length === 0) return "Choose where to send this automation's results.";
  return null;
}

function buildRunBlock(draft: JobDraft): Record<string, unknown> {
  if (draft.runMode === "action") {
    // A prompt rides along only for an action that launches an agent; the
    // editor blanks it for any other action before saving.
    const text = composerValueToText(draft.prompt).trim();
    return text ? { action: draft.action.trim(), prompt: text } : { action: draft.action.trim() };
  }
  if (draft.runMode === "cmd") return { cmd: draft.cmd.trim() };
  const block: Record<string, unknown> = {
    prompt: composerValueToText(draft.prompt),
  };
  if (draft.agent.trim()) block.agent = draft.agent.trim();
  if (draft.model.trim()) block.model = draft.model.trim();
  if (draft.effort.trim()) block.effort = draft.effort.trim();
  if (draft.access === "read") block.access = "read";
  if (draft.quiet) block.quiet = true;
  if (draft.memory) block.memory = true;
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
  payload.schedule = scheduleBlockFromDraft(draft);
  if (draft.check.trim()) payload.check = draft.check.trim();
  if (draft.verify.trim()) payload.verify = draft.verify.trim();
  const duplicate = buildDuplicateValue(draft);
  if (duplicate !== null) payload.duplicate = duplicate;
  payload.run = buildRunBlock(draft);
  const sendTo = writeSendTo(draft.sendTo);
  if (sendTo) payload.sendTo = sendTo;
  if (draft.machines.length > 0) payload.machines = [...draft.machines];
  return payload;
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
  draft.sendTo = readSendTo(payload.sendTo);
  draft.machines = readMachines(payload.machines);

  const schedule = payload.schedule;
  if (schedule && typeof schedule === "object") {
    readScheduleIntoDraft(draft, schedule as Record<string, unknown>);
  }

  const run = payload.run;
  if (run && typeof run === "object") {
    const r = run as Record<string, unknown>;
    if (typeof r.action === "string" && r.action.trim()) {
      draft.runMode = "action";
      draft.action = r.action.trim();
      if (typeof r.prompt === "string" && r.prompt.trim()) draft.prompt = textToPrompt(r.prompt);
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
      draft.quiet = r.quiet === true;
      draft.memory = r.memory === true;
    }
  }

  if (typeof payload.check === "string") draft.check = payload.check;
  if (Array.isArray(payload.projects)) {
    draft.targets = payload.projects.map((p) => String(p));
  }
  return draft;
}
