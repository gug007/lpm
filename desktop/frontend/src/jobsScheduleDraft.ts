// The schedule half of the job editor's draft: turning it into the YAML
// `schedule:` block, reading that block back, checking it the way the backend
// will (jobs.rs / jobcal.rs), and turning it into the JobSchedule the rest of
// the UI describes and draws.

import type { IntervalUnit, JobDraft, JobSchedule } from "./jobsFormat";
import { normalizeCron, parseCron } from "./cronExpr";
import {
  draftToEventSchedule,
  eventBlockFromDraft,
  readEventIntoDraft,
  validateEventDraft,
} from "./jobsEvents";
import {
  parseIsoDate,
  readDaysValue,
  writeDaysValue,
  type DaysValue,
} from "./jobsScheduleRules";
import { WEEKDAYS, type Weekday } from "./weekdays";

const UNIT_SECS: Record<IntervalUnit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86400,
};

// The scheduler's floor (jobs.rs MIN_INTERVAL_SECS).
export const MIN_INTERVAL_SECS = 300;

export function parseTimeToMinutes(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function orderDays(days: Weekday[]): Weekday[] {
  return WEEKDAYS.filter((d) => days.includes(d));
}

function intervalSecs(draft: JobDraft): number {
  return draft.intervalValue * UNIT_SECS[draft.intervalUnit];
}

// The far end of a varying gap, or undefined for a fixed one. Both ends share
// the draft's single unit, so only the number differs.
function intervalMaxSecs(draft: JobDraft): number | undefined {
  if (!draft.varyInterval) return undefined;
  return draft.intervalMaxValue * UNIT_SECS[draft.intervalUnit];
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
  if (draft.dayRule !== "week" || !draft.randomDays || draft.pickDays < 1) return undefined;
  const pool = draft.days.length === 0 ? 7 : draft.days.length;
  return draft.pickDays >= pool ? undefined : draft.pickDays;
}

// The fixed times of day the draft runs at, earliest first — just the window's
// start when the time is drawn from a window. Null while any is unreadable.
export function draftTimes(draft: JobDraft): number[] | null {
  const raw = draft.randomWindow ? [draft.time] : [draft.time, ...draft.moreTimes];
  const minutes = raw.map(parseTimeToMinutes);
  if (minutes.some((m) => m === null)) return null;
  return [...new Set(minutes as number[])].sort((a, b) => a - b);
}

function draftDaysValue(draft: JobDraft): DaysValue {
  switch (draft.dayRule) {
    case "dates":
      return { kind: "dates", dates: draft.monthDates, last: draft.lastDay };
    case "nth":
      return { kind: "nth", nth: draft.nth, of: draft.nthOf };
    case "once":
      return { kind: "once", dates: draft.onceDate ? [draft.onceDate] : [] };
    default:
      return { kind: "week", days: draft.days };
  }
}

function writesShortMonths(draft: JobDraft): boolean {
  return (
    draft.dayRule === "dates" &&
    draft.shortMonths === "last" &&
    draft.monthDates.some((d) => d > 28)
  );
}

export function draftToSchedule(draft: JobDraft): JobSchedule | null {
  if (draft.scheduleKind === "event") return draftToEventSchedule(draft);
  if (draft.scheduleKind === "cron") {
    const parsed = parseCron(draft.cron);
    return parsed.ok ? { mode: "cron", cron: parsed.spec.source } : null;
  }
  if (draft.scheduleMode === "manual") return { mode: "manual" };
  if (draft.scheduleMode === "interval") {
    const schedule: Extract<JobSchedule, { mode: "interval" }> = {
      mode: "interval",
      everySecs: intervalSecs(draft),
      everyMaxSecs: intervalMaxSecs(draft),
    };
    if (draft.intervalWindow) {
      const from = parseTimeToMinutes(draft.intervalFrom);
      const until = parseTimeToMinutes(draft.intervalUntil);
      if (from === null || until === null) return null;
      schedule.fromMinutes = from;
      schedule.untilMinutes = until;
    }
    const days = orderDays(draft.intervalDays);
    if (days.length > 0 && days.length < 7) schedule.days = days;
    return schedule;
  }

  const times = draftTimes(draft);
  if (!times) return null;
  const until = draftUntilMinutes(draft);
  if (draft.randomWindow && until === null) return null;
  const schedule: Extract<JobSchedule, { mode: "calendar" }> = {
    mode: "calendar",
    atMinutes: times[0],
    days: [],
    untilMinutes: until ?? undefined,
    times: draft.randomWindow ? Math.max(1, draft.timesPerDay) : 1,
  };
  if (times.length > 1) schedule.alsoAtMinutes = times.slice(1);
  const days = draftDaysValue(draft);
  if (days.kind === "week") {
    schedule.days = days.days;
    schedule.pickDays = draftPickDays(draft);
  } else if (days.kind === "dates") {
    if (days.dates.length === 0 && !days.last) return null;
    schedule.monthDays = days.dates;
    if (days.last) schedule.lastDay = true;
    if (writesShortMonths(draft)) schedule.shortMonths = "last";
  } else if (days.kind === "nth") {
    schedule.nth = days.nth;
    schedule.nthOf = days.of;
  } else {
    if (days.dates.length === 0) return null;
    schedule.onDates = days.dates;
  }
  return schedule;
}

export function scheduleBlockFromDraft(draft: JobDraft): Record<string, unknown> {
  if (draft.scheduleKind === "event") return eventBlockFromDraft(draft);
  if (draft.scheduleKind === "cron") {
    return { cron: normalizeCron(draft.cron) };
  }
  if (draft.scheduleMode === "manual") {
    return { manual: true };
  }
  if (draft.scheduleMode === "interval") {
    const suffix = { minutes: "m", hours: "h", days: "d" }[draft.intervalUnit];
    const vary =
      draft.varyInterval && draft.intervalMaxValue > draft.intervalValue;
    const block: Record<string, unknown> = {
      every: vary
        ? `${draft.intervalValue}-${draft.intervalMaxValue}${suffix}`
        : `${draft.intervalValue}${suffix}`,
    };
    if (draft.intervalWindow) {
      block.at = draft.intervalFrom.trim();
      block.until = draft.intervalUntil.trim();
    }
    const days = writeDaysValue({ kind: "week", days: draft.intervalDays });
    if (days !== undefined) block.days = days;
    return block;
  }

  const block: Record<string, unknown> = {};
  if (draft.randomWindow) {
    block.at = draft.time.trim();
    block.until = draft.untilTime.trim();
    if (draft.timesPerDay > 1) block.times = draft.timesPerDay;
  } else {
    const times = [...new Set([draft.time, ...draft.moreTimes].map((t) => t.trim()))].sort(
      (a, b) => (parseTimeToMinutes(a) ?? 0) - (parseTimeToMinutes(b) ?? 0),
    );
    block.at = times.length === 1 ? times[0] : times;
  }
  const days = writeDaysValue(draftDaysValue(draft));
  if (days !== undefined) block.days = days;
  if (writesShortMonths(draft)) block.shortMonths = "last";
  const pickDays = draftPickDays(draft);
  if (pickDays !== undefined) block.pickDays = pickDays;
  return block;
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

function readAts(at: unknown): string[] {
  const list = Array.isArray(at) ? at : [at];
  return list
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter(Boolean);
}

// Reverse of scheduleBlockFromDraft. Unknown or partial shapes leave the
// draft's defaults in place so the editor always opens in a sane state.
export function readScheduleIntoDraft(draft: JobDraft, s: Record<string, unknown>): void {
  if (readEventIntoDraft(draft, s)) return;
  if (typeof s.cron === "string" && s.cron.trim()) {
    draft.scheduleKind = "cron";
    draft.cron = normalizeCron(s.cron);
    return;
  }
  if (s.manual === true) {
    draft.scheduleMode = "manual";
    return;
  }
  const ats = readAts(s.at);
  const until = typeof s.until === "string" ? s.until.trim() : "";
  const days = readDaysValue(s.days);

  if (s.every !== undefined && s.every !== null) {
    const { value, unit, maxValue } = parseEvery(s.every);
    draft.scheduleMode = "interval";
    draft.intervalValue = value;
    draft.intervalUnit = unit;
    if (maxValue !== undefined && maxValue > value) {
      draft.varyInterval = true;
      draft.intervalMaxValue = maxValue;
    }
    if (ats.length > 0 && until) {
      draft.intervalWindow = true;
      draft.intervalFrom = ats[0];
      draft.intervalUntil = until;
    }
    if (days.kind === "week") draft.intervalDays = days.days;
    return;
  }

  draft.scheduleMode = "time";
  if (ats.length > 0) {
    draft.time = ats[0];
    draft.moreTimes = ats.slice(1);
  }
  if (days.kind === "week") {
    draft.days = days.days;
  } else if (days.kind === "dates") {
    draft.dayRule = "dates";
    draft.monthDates = days.dates;
    draft.lastDay = days.last;
    draft.shortMonths = s.shortMonths === "last" ? "last" : "skip";
  } else if (days.kind === "nth") {
    draft.dayRule = "nth";
    draft.nth = days.nth;
    draft.nthOf = days.of;
  } else {
    draft.dayRule = "once";
    draft.onceDate = days.dates[0];
  }
  if (until) {
    draft.randomWindow = true;
    draft.untilTime = until;
    const times = Number(s.times);
    if (Number.isFinite(times) && times > 1) {
      draft.timesPerDay = Math.floor(times);
    }
  }
  const pickDays = Number(s.pickDays);
  if (days.kind === "week" && Number.isFinite(pickDays) && pickDays >= 1) {
    draft.randomDays = true;
    draft.pickDays = Math.floor(pickDays);
  }
}

function validateTimeOfDay(draft: JobDraft, now: Date): string | null {
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
  } else {
    const times = draftTimes(draft);
    if (!times) return "Pick a valid time.";
    for (let i = 1; i < times.length; i++) {
      if ((times[i] - times[i - 1]) * 60 < MIN_INTERVAL_SECS) {
        return "Keep the times at least 5 minutes apart.";
      }
    }
  }
  if (draft.dayRule === "week" && draft.randomDays && draft.pickDays < 1) {
    return "Pick at least one day.";
  }
  if (draft.dayRule === "dates" && draft.monthDates.length === 0 && !draft.lastDay) {
    return "Pick at least one date.";
  }
  if (draft.dayRule === "once") {
    const day = parseIsoDate(draft.onceDate);
    if (!day) return "Pick a date.";
    const lastTime = Math.max(...(draftTimes(draft) ?? [at]));
    day.setMinutes(lastTime);
    if (day.getTime() < now.getTime()) return "That date has already passed.";
  }
  return null;
}

// Mirrors the backend validation so save is blocked before a write the
// scheduler would reject, and the message reads in product terms.
export function validateDraftSchedule(draft: JobDraft, now: Date = new Date()): string | null {
  if (draft.scheduleKind === "event") return validateEventDraft(draft);
  if (draft.scheduleKind === "cron") {
    const parsed = parseCron(draft.cron);
    return parsed.ok ? null : parsed.error;
  }
  if (draft.scheduleMode === "time") return validateTimeOfDay(draft, now);
  if (draft.scheduleMode !== "interval") return null;
  if (!Number.isFinite(draft.intervalValue) || draft.intervalValue < 1) {
    return "The interval must be at least 1.";
  }
  if (intervalSecs(draft) < MIN_INTERVAL_SECS) {
    return "The interval must be at least 5 minutes.";
  }
  if (draft.varyInterval && draft.intervalMaxValue < draft.intervalValue) {
    return "The longest gap has to be at least the shortest.";
  }
  if (draft.intervalWindow) {
    const from = parseTimeToMinutes(draft.intervalFrom);
    const until = parseTimeToMinutes(draft.intervalUntil);
    if (from === null || until === null) return "Pick valid times for the window.";
    if (until <= from) return "The window has to end after it starts.";
  }
  return null;
}
