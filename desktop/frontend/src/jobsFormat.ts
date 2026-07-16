// Pure formatting and draft/payload helpers for scheduled jobs. Kept free of
// React and the bridge so the schedule <-> human-string mapping and the YAML
// jobs-block round-trip can be unit tested directly.

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
  enabled: boolean;
  duplicate?: boolean;
  runKind?: JobRunKind;
  schedule?: JobSchedule;
  lastRunAt?: number;
  lastResult?: string;
  nextFireAt?: number;
}

export interface JobHistoryEntry {
  at: number;
  result: string;
  copy?: string;
  output?: string;
}

// Result strings emitted by the backend pipeline (jobs.rs).
export type JobResult =
  | "nothing-to-do"
  | "found-work"
  | "completed"
  | "error"
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
  prompt: string;
  // Which agent CLI runs a prompt job and with which model; both empty = the
  // app's default agent with its default model. `effort` is the reasoning
  // effort (Claude/Codex only); empty = the model's default.
  agent: string;
  model: string;
  effort: string;
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
    prompt: "",
    agent: "",
    model: "",
    effort: "",
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
export function validateJobDraft(draft: JobDraft): string | null {
  if (!draft.label.trim()) return "Give this job a name.";
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
  if (draft.runMode === "prompt" && !draft.prompt.trim()) {
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

function buildRunBlock(draft: JobDraft): Record<string, unknown> {
  if (draft.runMode === "action") return { action: draft.action.trim() };
  if (draft.runMode === "cmd") return { cmd: draft.cmd.trim() };
  const block: Record<string, unknown> = { prompt: draft.prompt.trim() };
  if (draft.agent.trim()) block.agent = draft.agent.trim();
  if (draft.model.trim()) block.model = draft.model.trim();
  if (draft.effort.trim()) block.effort = draft.effort.trim();
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
      draft.prompt = r.prompt;
      if (typeof r.agent === "string") draft.agent = r.agent.trim().toLowerCase();
      if (typeof r.model === "string") draft.model = r.model.trim();
      if (typeof r.effort === "string") draft.effort = r.effort.trim().toLowerCase();
    }
  }

  if (typeof payload.check === "string") draft.check = payload.check;
  return draft;
}
