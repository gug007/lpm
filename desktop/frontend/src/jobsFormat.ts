// Pure formatting and draft/payload helpers for scheduled jobs. Kept free of
// React and the bridge so the schedule <-> human-string mapping and the YAML
// jobs-block round-trip can be unit tested directly.

import { composerValueToText, EMPTY_COMPOSER, isImagePath } from "./composerValue";
import type { ComposerImage, ComposerValue } from "./composerValue";

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

export type JobSchedule =
  | { mode: "interval"; everySecs: number }
  | { mode: "calendar"; atMinutes: number; days: Weekday[] };

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
  "pending-window": { label: () => "Waiting for the app window", tone: "warning" },
};

export function jobResultLabel(result: string | undefined, copy?: string): string {
  if (!result) return "";
  return RESULT_META[result]?.label(copy) ?? result;
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

// Plain-language schedule: "Every day at 09:00", "Mondays and Thursdays at
// 09:00", "Every 6 hours", "Every 2 days".
export function formatSchedule(schedule: JobSchedule): string {
  if (schedule.mode === "interval") {
    return formatInterval(schedule.everySecs);
  }
  const time = formatMinutes(schedule.atMinutes);
  if (schedule.days.length === 0 || schedule.days.length === 7) {
    return `Every day at ${time}`;
  }
  return `${joinDayPhrase(schedule.days)} at ${time}`;
}

export function formatInterval(everySecs: number): string {
  if (everySecs > 0 && everySecs % 86400 === 0) {
    const days = everySecs / 86400;
    return days === 1 ? "Every day" : `Every ${days} days`;
  }
  const hours = Math.max(1, Math.round(everySecs / 3600));
  return hours === 1 ? "Every hour" : `Every ${hours} hours`;
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

export type ScheduleMode = "time" | "interval";
export type IntervalUnit = "hours" | "days";

export interface JobDraft {
  label: string;
  emoji: string;
  scheduleMode: ScheduleMode;
  time: string;
  days: Weekday[];
  intervalValue: number;
  intervalUnit: IntervalUnit;
  check: string;
  duplicate: boolean;
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
  // The projects a new job runs in (empty = standalone). New jobs only; the edit
  // path shows scope read-only and never rewrites it from this.
  targets: string[];
}

export function defaultJobDraft(): JobDraft {
  return {
    label: "",
    emoji: "",
    scheduleMode: "time",
    time: "09:00",
    days: [],
    intervalValue: 6,
    intervalUnit: "hours",
    check: "",
    duplicate: false,
    runMode: "prompt",
    action: "",
    cmd: "",
    prompt: EMPTY_COMPOSER,
    agent: "",
    model: "",
    effort: "",
    access: "full",
    targets: [],
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
  if (draft.scheduleMode === "interval") {
    const secs =
      draft.intervalUnit === "days"
        ? draft.intervalValue * 86400
        : draft.intervalValue * 3600;
    return formatInterval(secs);
  }
  const minutes = parseTimeToMinutes(draft.time);
  if (minutes === null) return "";
  return formatSchedule({ mode: "calendar", atMinutes: minutes, days: draft.days });
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
    if (parseTimeToMinutes(draft.time) === null) return "Pick a valid time.";
  } else {
    if (!Number.isFinite(draft.intervalValue) || draft.intervalValue < 1) {
      return "The interval must be at least 1.";
    }
    if (draft.intervalUnit === "hours" && draft.intervalValue < 1) {
      return "The interval must be at least 1 hour.";
    }
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
  if (draft.scheduleMode === "interval") {
    const suffix = draft.intervalUnit === "days" ? "d" : "h";
    return { every: `${draft.intervalValue}${suffix}` };
  }
  const block: Record<string, unknown> = { at: draft.time.trim() };
  if (draft.days.length > 0 && draft.days.length < 7) {
    block.days = orderDays(draft.days);
  }
  return block;
}

// An absolute path standing on its own in the prompt text — the shape an
// attachment serializes to, and what parsing turns back into a chip.
const ABS_PATH_RE = /(?<![^\s])\/\S+/g;

// Reverse of composerValueToText: every standalone absolute image path becomes an
// attachment token again, so an edited job shows its chips back. Any other path
// stays literal text, and re-serializing reproduces the stored string verbatim.
function textToPrompt(text: string): ComposerValue {
  const images: ComposerImage[] = [];
  const out = text.replace(ABS_PATH_RE, (path) => {
    if (!isImagePath(path)) return path;
    const token = images.length + 1;
    images.push({ token, path });
    return `[Image #${token}]`;
  });
  return { text: out, images, pending: false };
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

// The YAML mapping written under `jobs: <id>:`. Optional fields are omitted when
// empty so a clean job stays terse (matching how actions are serialized).
export function buildJobPayload(draft: JobDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = { label: draft.label.trim() };
  if (draft.emoji.trim()) payload.emoji = draft.emoji.trim();
  payload.schedule = buildScheduleBlock(draft);
  if (draft.check.trim()) payload.check = draft.check.trim();
  if (draft.duplicate) payload.duplicate = true;
  payload.run = buildRunBlock(draft);
  return payload;
}

function parseEvery(every: unknown): {
  value: number;
  unit: IntervalUnit;
} {
  if (typeof every === "number") {
    return { value: Math.max(1, Math.round(every)), unit: "hours" };
  }
  const s = String(every ?? "").trim().toLowerCase();
  const m = /^(\d+)\s*([hd]?)$/.exec(s);
  if (!m) return { value: 6, unit: "hours" };
  const value = Math.max(1, Number(m[1]));
  return { value, unit: m[2] === "d" ? "days" : "hours" };
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
  draft.duplicate = payload.duplicate === true;

  const schedule = payload.schedule;
  if (schedule && typeof schedule === "object") {
    const s = schedule as Record<string, unknown>;
    if (s.every !== undefined && s.every !== null) {
      const { value, unit } = parseEvery(s.every);
      draft.scheduleMode = "interval";
      draft.intervalValue = value;
      draft.intervalUnit = unit;
    } else {
      draft.scheduleMode = "time";
      if (typeof s.at === "string" && s.at.trim()) draft.time = s.at.trim();
      draft.days = asStringArray(s.days);
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
