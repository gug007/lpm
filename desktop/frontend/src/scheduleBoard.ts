// Lays a week of job runs out as a grid: seven day columns against a time axis
// that collapses wherever nothing is scheduled, so a week with two busy hours
// doesn't render as twenty-two empty ones. Pure, so the placement and
// collapsing rules can be tested without a DOM.

import { jobOccurrences, weekdayOf, type JobOccurrence } from "./jobsOccurrences";
import type { JobInfo, Weekday } from "./jobsFormat";

type BoardJob = JobInfo & { project?: string };

export const BAND_HOURS = 3;
const BANDS = 24 / BAND_HOURS;

// Beyond this a day cell shows a count instead of every block.
export const MAX_BLOCKS_PER_CELL = 3;

export interface BoardDay {
  date: Date;
  start: number;
  end: number;
  weekday: Weekday;
  isToday: boolean;
  isPast: boolean;
}

export interface BoardBand {
  fromHour: number;
  toHour: number;
}

export interface BoardCell {
  day: BoardDay;
  items: JobOccurrence[];
  hidden: number;
}

export type BoardRow =
  | { kind: "band"; band: BoardBand; cells: BoardCell[] }
  | { kind: "quiet"; band: BoardBand };

export interface Board {
  days: BoardDay[];
  rows: BoardRow[];
  // Jobs that never land on a calendar: manual ones, and anything whose
  // schedule the backend couldn't resolve into a fire point.
  unscheduled: BoardJob[];
  // Jobs whose cadence is too tight to draw slot by slot.
  dense: BoardJob[];
  start: number;
  end: number;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Monday, to match how lpm's calendar schedules name their days.
export function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function weekDays(weekStart: Date, now: number): BoardDay[] {
  const today = new Date(now * 1000);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    // Real date arithmetic rather than a fixed 86400, so a DST day still ends
    // where the calendar says it does.
    const end = addDays(date, 1);
    return {
      date,
      start: Math.floor(date.getTime() / 1000),
      end: Math.floor(end.getTime() / 1000),
      weekday: weekdayOf(date.getTime()),
      isToday: sameDay(date, today),
      isPast: end.getTime() / 1000 <= now,
    };
  });
}

function bandOf(at: number): number {
  return Math.min(BANDS - 1, Math.floor(new Date(at * 1000).getHours() / BAND_HOURS));
}

// A job's slot belongs to the day it starts in; a windowed run that spills past
// midnight still reads under the day it was scheduled for.
function dayIndexOf(days: BoardDay[], at: number): number {
  return days.findIndex((d) => at >= d.start && at < d.end);
}

function isPlaceable(job: BoardJob): boolean {
  if (!job.valid) return false;
  const mode = job.schedule?.mode;
  return mode === "calendar" || mode === "interval";
}

export interface BuildBoardOptions {
  jobs: BoardJob[];
  weekStart: Date;
  now: number;
  keyOf: (job: BoardJob) => string;
}

export function buildBoard({
  jobs,
  weekStart,
  now,
  keyOf,
}: BuildBoardOptions): Board {
  const days = weekDays(weekStart, now);
  const start = days[0].start;
  const end = days[days.length - 1].end;

  const unscheduled: BoardJob[] = [];
  const dense: BoardJob[] = [];
  const placed: JobOccurrence[] = [];

  for (const job of jobs) {
    if (!isPlaceable(job)) {
      unscheduled.push(job);
      continue;
    }
    const { occurrences, truncated } = jobOccurrences(
      job,
      { from: start, to: end },
      now,
      keyOf(job),
    );
    if (truncated) dense.push(job);
    if (occurrences.length === 0 && !truncated) {
      // A schedule the backend gave no fire point for can't be drawn, but the
      // job still exists and shouldn't silently vanish from the week.
      if (job.nextFireAt === undefined && job.lastRunAt === undefined) {
        unscheduled.push(job);
      }
      continue;
    }
    placed.push(...occurrences);
  }

  const grid: JobOccurrence[][][] = Array.from({ length: BANDS }, () =>
    Array.from({ length: 7 }, () => [] as JobOccurrence[]),
  );
  for (const occ of placed) {
    const dayIndex = dayIndexOf(days, occ.at);
    if (dayIndex < 0) continue;
    grid[bandOf(occ.at)][dayIndex].push(occ);
  }

  const rows: BoardRow[] = [];
  for (let b = 0; b < BANDS; b++) {
    const band = { fromHour: b * BAND_HOURS, toHour: (b + 1) * BAND_HOURS };
    const used = grid[b].some((cell) => cell.length > 0);
    if (!used) {
      // Consecutive quiet bands read as one gap, not a stack of empty rows.
      const prev = rows[rows.length - 1];
      if (prev && prev.kind === "quiet") {
        prev.band = { fromHour: prev.band.fromHour, toHour: band.toHour };
      } else {
        rows.push({ kind: "quiet", band });
      }
      continue;
    }
    rows.push({
      kind: "band",
      band,
      cells: grid[b].map((items, dayIndex) => {
        const sorted = [...items].sort(byTimeThenName);
        return {
          day: days[dayIndex],
          items: sorted.slice(0, MAX_BLOCKS_PER_CELL),
          hidden: Math.max(0, sorted.length - MAX_BLOCKS_PER_CELL),
        };
      }),
    });
  }

  return { days, rows, unscheduled, dense, start, end };
}

function byTimeThenName(a: JobOccurrence, b: JobOccurrence): number {
  if (a.at !== b.at) return a.at - b.at;
  return jobName(a.job).localeCompare(jobName(b.job));
}

export function jobName(job: BoardJob): string {
  return job.label || job.id;
}

const CLOCK = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// "09:36" — the board reads as a timetable, so times stay 24h and fixed-width
// whatever the locale's usual clock is.
export function formatClock(at: number): string {
  return CLOCK.format(new Date(at * 1000));
}

// "in 4h 12m" / "in 3d" / "now" — how long until a slot fires.
export function untilLabel(at: number, now: number): string {
  const secs = at - now;
  if (secs <= 60) return "now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const rest = mins % 60;
    return rest === 0 ? `in ${hours}h` : `in ${hours}h ${rest}m`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `in ${days}d` : `in ${days}d ${restHours}h`;
}

// The runs due between now and `hours` from now, soonest first — the board
// answers "this week", the agenda answers "what is about to happen".
export function agendaAhead(
  jobs: BoardJob[],
  now: number,
  hours: number,
  keyOf: (job: BoardJob) => string,
): JobOccurrence[] {
  const to = now + hours * 3600;
  const out: JobOccurrence[] = [];
  for (const job of jobs) {
    if (!isPlaceable(job) || !job.enabled) continue;
    const { occurrences } = jobOccurrences(job, { from: now, to }, now, keyOf(job));
    out.push(...occurrences.filter((o) => o.state === "due"));
  }
  return out.sort(byTimeThenName);
}

export interface RecentRun {
  job: BoardJob;
  key: string;
  at: number;
  result?: string;
  unread: number;
}

// What each job last did, newest first. Built from the list payload the view
// already has rather than reading every job's history file.
export function recentRuns(
  jobs: BoardJob[],
  keyOf: (job: BoardJob) => string,
  limit = 8,
): RecentRun[] {
  return jobs
    .filter((job) => job.lastRunAt !== undefined)
    .map((job) => ({
      job,
      key: keyOf(job),
      at: job.lastRunAt as number,
      result: job.lastResult,
      unread: job.unread ?? 0,
    }))
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);
}

export function runningJobs(jobs: BoardJob[]): BoardJob[] {
  return jobs
    .filter((job) => job.running === true)
    .sort((a, b) => (a.runningSince ?? 0) - (b.runningSince ?? 0));
}

// The week's span, in the reader's locale — "Aug 24 – 30", "24.–30. Aug.".
// formatRange drops whatever the two ends share, so the month is only named
// twice when the week actually straddles one.
export function weekRangeLabel(weekStart: Date, today = new Date()): string {
  const end = addDays(weekStart, 6);
  const showYear =
    weekStart.getFullYear() !== today.getFullYear() ||
    end.getFullYear() !== today.getFullYear();
  const fmt = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    ...(showYear ? { year: "numeric" } : {}),
  });
  return fmt.formatRange(weekStart, end);
}
