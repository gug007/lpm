// The job editor's footer line: when a schedule first runs ("First run Mon,
// Oct 12 around 09:00") and how it repeats after that ("Then every weekday").

import { dayPhrase, formatSchedule, timePhrase, type JobSchedule, type Weekday } from "./jobsFormat";
import { expandSchedule } from "./jobsOccurrences";
import { dateRulePhrase, hasDateRule, isOnce } from "./jobsScheduleRules";
import { formatClock } from "./scheduleBoard";

const LOOKAHEAD_SECS = 400 * 86400;

export interface FirstRun {
  first: string;
  then?: string;
}

type Calendar = Extract<JobSchedule, { mode: "calendar" }>;

function slotDate(at: number, now: Date): string {
  const d = new Date(at * 1000);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

// "every day", "every weekday", "on Mondays and Thursdays", "on 2 random
// weekdays a week".
function onDays(days: Weekday[], pickDays?: number): string {
  const phrase = dayPhrase(days, pickDays);
  if (phrase === "every day") return phrase;
  if (phrase === "weekdays") return "every weekday";
  return `on ${phrase}`;
}

// The repeat without the time of day the first run already names — unless the
// day holds more than one set time.
function calendarCadence(schedule: Calendar): string {
  const times = schedule.times ?? 1;
  const count = times > 1 ? `${times} times ` : "";
  const at =
    schedule.untilMinutes === undefined && (schedule.alsoAtMinutes?.length ?? 0) > 0
      ? ` ${timePhrase(schedule.atMinutes, undefined, schedule.alsoAtMinutes)}`
      : "";
  if (hasDateRule(schedule)) return `${count}${dateRulePhrase(schedule)}${at}`;
  const days = onDays(schedule.days, schedule.pickDays);
  if (count && days === "every day") return `${count}a day`;
  return `${count}${days}${at}`;
}

// A random day or gap only promises the earliest the job can start.
function isRandom(schedule: Exclude<JobSchedule, { mode: "manual" | "event" }>): boolean {
  if (schedule.mode === "calendar") return (schedule.pickDays ?? 0) > 0;
  if (schedule.mode === "interval") return (schedule.everyMaxSecs ?? 0) > schedule.everySecs;
  return false;
}

export function describeFirstRun(
  schedule: JobSchedule | null,
  lead = "First run",
  now: Date = new Date(),
): FirstRun | null {
  if (!schedule) return null;
  if (schedule.mode === "manual") return { first: "Runs only when you start it" };
  if (schedule.mode === "event") {
    return { first: `Runs ${formatSchedule(schedule).replace(/^./, (c) => c.toLowerCase())}` };
  }

  const from = Math.floor(now.getTime() / 1000);
  const slot = expandSchedule(
    schedule,
    { from, to: from + LOOKAHEAD_SECS },
    { lastRunAt: from },
  ).slots.find((s) => s.at > from);
  if (!slot) return null;

  // A cron line runs on its minute; the other schedules spread their starts.
  const time =
    slot.untilAt !== undefined
      ? `between ${formatClock(slot.at)} and ${formatClock(slot.untilAt)}`
      : `${schedule.mode === "cron" ? "at" : "around"} ${formatClock(slot.at)}`;
  const when = `${slotDate(slot.at, now)} ${time}`;

  if (schedule.mode === "calendar" && isOnce(schedule) && schedule.onDates?.length === 1) {
    const times = schedule.times ?? 1;
    return { first: `Runs ${times > 1 ? `${times} times` : "once"} on ${when}` };
  }

  const cadence =
    schedule.mode === "calendar"
      ? calendarCadence(schedule)
      : formatSchedule(schedule).replace(/^./, (c) => c.toLowerCase());
  return {
    first: `${isRandom(schedule) ? "Earliest run" : lead} ${when}`,
    then: `Then ${cadence}`,
  };
}
