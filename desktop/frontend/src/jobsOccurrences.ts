// Turns a job's schedule into the individual runs it puts on a calendar. The
// flat list only ever needs the single `nextFireAt` the backend computes; a
// board has to know every slot inside a window, which means replaying the
// schedule here. Pure so the expansion rules can be tested directly.

import { WEEKDAYS, type JobInfo, type JobSchedule, type Weekday } from "./jobsFormat";

export type OccurrenceState =
  | "ran"
  | "running"
  | "due"
  | "past"
  | "paused";

export interface JobOccurrence {
  job: JobInfo & { project?: string };
  // Stable per-slot key: the job's row key plus the slot's start.
  key: string;
  at: number;
  // Set when the run time is drawn from a window rather than fixed.
  untilAt?: number;
  state: OccurrenceState;
  // The schedule leaves the exact day or gap to chance, so this is where the
  // job is expected rather than where it will certainly land.
  approximate: boolean;
  // How many runs the slot stands for — a calendar schedule's `times`.
  count: number;
  result?: string;
}

export interface Window {
  from: number;
  to: number;
}

// A job firing every couple of minutes would otherwise draw thousands of
// blocks; past this the caller collapses the day into a count.
const MAX_SLOTS = 400;

export interface RawSlot {
  at: number;
  untilAt?: number;
  approximate: boolean;
  count: number;
}

export interface ExpandResult {
  slots: RawSlot[];
  truncated: boolean;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// JS weeks start on Sunday; lpm's schedules and board start on Monday.
export function weekdayOf(ms: number): Weekday {
  return WEEKDAYS[(new Date(ms).getDay() + 6) % 7];
}

function runsOnDay(days: Weekday[], day: Weekday): boolean {
  if (days.length === 0 || days.length >= WEEKDAYS.length) return true;
  return days.includes(day);
}

function expandCalendar(
  schedule: Extract<JobSchedule, { mode: "calendar" }>,
  window: Window,
): ExpandResult {
  const slots: RawSlot[] = [];
  // A window drawn from a range, or a random pick of the listed days, means the
  // slot marks where the run is expected rather than when it will happen.
  const approximate =
    schedule.untilMinutes !== undefined || (schedule.pickDays ?? 0) > 0;
  const count = Math.max(1, schedule.times ?? 1);

  let day = startOfDay(window.from * 1000);
  const end = window.to * 1000;
  while (day <= end && slots.length < MAX_SLOTS) {
    if (runsOnDay(schedule.days, weekdayOf(day))) {
      const at = day / 1000 + schedule.atMinutes * 60;
      // An `until` before `at` would draw a backwards block; treat it as absent
      // rather than inventing a wrap into the next day.
      const until =
        schedule.untilMinutes !== undefined &&
        schedule.untilMinutes > schedule.atMinutes
          ? day / 1000 + schedule.untilMinutes * 60
          : undefined;
      if ((until ?? at) >= window.from && at <= window.to) {
        slots.push({ at, untilAt: until, approximate, count });
      }
    }
    day = startOfDay(day + 36 * 3600 * 1000);
  }
  return { slots, truncated: slots.length >= MAX_SLOTS };
}

function expandInterval(
  schedule: Extract<JobSchedule, { mode: "interval" }>,
  window: Window,
  anchors: { nextFireAt?: number; lastRunAt?: number },
): ExpandResult {
  const step = Math.max(60, Math.round(schedule.everySecs));
  // Without a fire point there is nothing to hang the cadence on — the backend
  // supplies one for every enabled job, and a paused job keeps its last run.
  const anchor =
    anchors.nextFireAt ??
    (anchors.lastRunAt !== undefined ? anchors.lastRunAt + step : undefined);
  if (anchor === undefined) return { slots: [], truncated: false };

  // A gap drawn from a band only pins the next fire; everything either side of
  // it is the stated cadence, not a promise.
  const approximate =
    schedule.everyMaxSecs !== undefined && schedule.everyMaxSecs > step;

  const first = anchor - Math.ceil((anchor - window.from) / step) * step;
  const slots: RawSlot[] = [];
  for (let at = first; at <= window.to && slots.length < MAX_SLOTS; at += step) {
    if (at >= window.from) slots.push({ at, approximate, count: 1 });
  }
  return { slots, truncated: slots.length >= MAX_SLOTS };
}

// Every run a schedule puts inside `window`, oldest first.
export function expandSchedule(
  schedule: JobSchedule | undefined,
  window: Window,
  anchors: { nextFireAt?: number; lastRunAt?: number } = {},
): ExpandResult {
  if (!schedule || schedule.mode === "manual" || window.to <= window.from) {
    return { slots: [], truncated: false };
  }
  return schedule.mode === "calendar"
    ? expandCalendar(schedule, window)
    : expandInterval(schedule, window, anchors);
}

// How far from a scheduled slot a recorded run still counts as that slot. A
// run starts when the scheduler gets to it, which is never exactly on the mark.
const RUN_MATCH_SECS = 30 * 60;

function slotState(
  slot: RawSlot,
  job: JobInfo,
  now: number,
): OccurrenceState {
  if (!job.enabled) return "paused";
  return (slot.untilAt ?? slot.at) >= now ? "due" : "past";
}

// One job's slots inside the window, with what actually happened folded in:
// the live run, and the one run we know the outcome of. Slots the backend
// never promised stay marked approximate so the board can draw them softly.
export function jobOccurrences(
  job: JobInfo & { project?: string },
  window: Window,
  now: number,
  keyPrefix: string,
): { occurrences: JobOccurrence[]; truncated: boolean } {
  const { slots, truncated } = expandSchedule(job.schedule, window, {
    nextFireAt: job.nextFireAt,
    lastRunAt: job.lastRunAt,
  });

  const occurrences: JobOccurrence[] = slots.map((slot) => ({
    job,
    key: `${keyPrefix}@${slot.at}`,
    at: slot.at,
    untilAt: slot.untilAt,
    state: slotState(slot, job, now),
    approximate: slot.approximate,
    count: slot.count,
  }));

  // The last run we have an outcome for takes over the slot it belongs to, so
  // a day shows what happened rather than what was planned.
  const lastRunAt = job.lastRunAt;
  if (lastRunAt !== undefined && lastRunAt >= window.from && lastRunAt <= window.to) {
    const hit = nearestSlot(occurrences, lastRunAt);
    if (hit) {
      hit.state = "ran";
      hit.result = job.lastResult;
      hit.approximate = false;
      hit.at = lastRunAt;
    } else {
      occurrences.push({
        job,
        key: `${keyPrefix}@ran-${lastRunAt}`,
        at: lastRunAt,
        state: "ran",
        approximate: false,
        count: 1,
        result: job.lastResult,
      });
    }
  }

  const since = job.runningSince;
  if (job.running && since !== undefined && since >= window.from && since <= window.to) {
    const hit = nearestSlot(occurrences, since);
    if (hit) {
      hit.state = "running";
      hit.result = undefined;
      hit.approximate = false;
      hit.at = since;
    } else {
      occurrences.push({
        job,
        key: `${keyPrefix}@run-${since}`,
        at: since,
        state: "running",
        approximate: false,
        count: 1,
      });
    }
  }

  occurrences.sort((a, b) => a.at - b.at);
  return { occurrences, truncated };
}

function nearestSlot(
  occurrences: JobOccurrence[],
  at: number,
): JobOccurrence | undefined {
  let best: JobOccurrence | undefined;
  let bestGap = Infinity;
  for (const occ of occurrences) {
    if (occ.state === "ran" || occ.state === "running") continue;
    // A windowed slot owns any run inside it, however wide the window is.
    const gap =
      occ.untilAt !== undefined && at >= occ.at && at <= occ.untilAt
        ? 0
        : Math.abs(occ.at - at);
    if (gap < bestGap) {
      bestGap = gap;
      best = occ;
    }
  }
  return bestGap <= RUN_MATCH_SECS ? best : undefined;
}
