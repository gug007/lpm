import { durationShort } from "../components/stats/limitsFormat";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

// Longest wait a typed time may ask for; anything further is almost always a
// typo ("500h") rather than a plan.
const MAX_AHEAD = 60 * DAY;

const clockFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export function clockLabel(at: number): string {
  return clockFormat.format(at);
}

export function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Whole calendar days from `now`'s date to `at`'s; rounding absorbs the 23- and
// 25-hour days daylight saving leaves behind.
export function dayOffset(at: number, now: number): number {
  return Math.round((startOfDay(at) - startOfDay(now)) / DAY);
}

export function dayLabel(at: number, now: number): string {
  const offset = dayOffset(at, now);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  if (offset > 1 && offset < 7) return weekdayFormat.format(at);
  return dateFormat.format(at);
}

export function whenLabel(at: number, now: number): string {
  return `${dayLabel(at, now)} ${clockLabel(at)}`;
}

// The time alone for today, the day too otherwise: what a mark or dot reads.
export function shortWhenLabel(at: number, now: number): string {
  return dayOffset(at, now) === 0 ? clockLabel(at) : whenLabel(at, now);
}

export function countdownLabel(at: number, now: number): string {
  const ms = at - now;
  return ms < MINUTE / 2 ? "now" : `in ${durationShort(ms)}`;
}

export function readbackLabel(at: number, now: number): string {
  return `${whenLabel(at, now)} · ${countdownLabel(at, now)}`;
}

export function scheduleButtonLabel(at: number, now: number): string {
  const offset = dayOffset(at, now);
  if (offset === 0) return `Schedule for ${clockLabel(at)}`;
  if (offset === 1) return `Schedule for tomorrow ${clockLabel(at)}`;
  return `Schedule for ${whenLabel(at, now)}`;
}

export function atClock(day: number, hours: number, minutes: number): number {
  const d = new Date(day);
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}

export function addDays(at: number, days: number): number {
  const d = new Date(at);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

const UNIT_MS: Record<string, number> = {
  d: DAY,
  day: DAY,
  days: DAY,
  h: HOUR,
  hr: HOUR,
  hrs: HOUR,
  hour: HOUR,
  hours: HOUR,
  m: MINUTE,
  min: MINUTE,
  mins: MINUTE,
  minute: MINUTE,
  minutes: MINUTE,
};

const DURATION_PART = /(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m)(?![a-z])/g;

function parseDuration(text: string): number | null {
  if (!/^\s*\d/.test(text)) return null;
  let total = 0;
  let consumed = "";
  for (const m of text.matchAll(DURATION_PART)) {
    total += Number(m[1]) * UNIT_MS[m[2]];
    consumed += m[0];
  }
  const rest = text.replace(DURATION_PART, "").replace(/\s|and|,/g, "");
  if (!consumed || rest) return null;
  return total > 0 ? total : null;
}

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// "fri", "thurs", "wednesday": three letters is enough to tell any two apart.
function weekdayIndex(word: string): number {
  if (word.length < 3) return -1;
  return WEEKDAY_NAMES.findIndex((name) => name.startsWith(word));
}

interface ClockTime {
  hours: number;
  minutes: number;
  // False when the words gave no am/pm and the hour could be either.
  settled: boolean;
}

function parseClock(text: string): ClockTime | null {
  if (text === "noon") return { hours: 12, minutes: 0, settled: true };
  if (text === "midnight") return { hours: 0, minutes: 0, settled: true };
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/.exec(text);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] === undefined ? 0 : Number(m[2]);
  const meridiem = m[3]?.[0];
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "p" && hours < 12) hours += 12;
    if (meridiem === "a" && hours === 12) hours = 0;
    return { hours, minutes, settled: true };
  }
  if (hours > 23) return null;
  return { hours, minutes, settled: hours === 0 || hours > 12 };
}

// The first moment at this clock time on or after `from`'s day that's still
// ahead of `now`. An hour with no am/pm takes whichever of its two readings
// comes first.
function nextAt(clock: ClockTime, day: number, now: number): number {
  const candidates = [atClock(day, clock.hours, clock.minutes)];
  if (!clock.settled) candidates.push(atClock(day, (clock.hours % 12) + 12, clock.minutes));
  if (!clock.settled && clock.hours === 12) candidates.push(atClock(day, 0, clock.minutes));
  const ahead = candidates.filter((t) => t > now).sort((a, b) => a - b);
  return ahead[0] ?? Number.NaN;
}

// A day named with no time lands on the start of a working morning.
const DEFAULT_MORNING: ClockTime = { hours: 9, minutes: 0, settled: true };

// Read a typed time: a delay ("90m", "2h 15m", "in 2 hours"), a clock time
// ("5pm", "17:30", "7:30 pm"), or a day with or without one ("tomorrow",
// "tomorrow 9", "fri 10am"). A clock time already past today means tomorrow.
// Null when the words don't name a moment ahead.
export function parseWhen(input: string, now: number): number | null {
  let text = input.trim().toLowerCase().replace(/\s+/g, " ");
  text = text.replace(/^(in|at|on) /, "").replace(/\.$/, "");
  if (!text) return null;

  const delay = parseDuration(text);
  if (delay !== null) return delay <= MAX_AHEAD ? now + delay : null;

  const words = text.split(" ");
  let day: number | null = null;
  let strictDay = false;
  const first = words[0];
  if (first === "today") {
    day = startOfDay(now);
    strictDay = true;
  } else if (first === "tomorrow" || first === "tmrw" || first === "tmr") {
    day = startOfDay(addDays(now, 1));
    strictDay = true;
  } else {
    const wd = weekdayIndex(first);
    if (wd !== -1) {
      const ahead = (wd - new Date(now).getDay() + 7) % 7;
      day = startOfDay(addDays(now, ahead));
    }
  }
  const clockText = (day === null ? words : words.slice(1)).join(" ").replace(/^at /, "");

  if (day === null) {
    const clock = parseClock(clockText);
    if (!clock) return null;
    const today = nextAt(clock, startOfDay(now), now);
    if (!Number.isNaN(today)) return today;
    return nextAt(clock, startOfDay(addDays(now, 1)), now);
  }

  const clock = clockText ? parseClock(clockText) : DEFAULT_MORNING;
  if (!clock) return null;
  const settled = clock.settled ? clock : settleByHabit(clock);
  const at = atClock(day, settled.hours, settled.minutes);
  if (at > now) return at <= now + MAX_AHEAD ? at : null;
  if (strictDay) return null;
  return addDays(at, 7);
}

// With a day named, an hour without am/pm reads the way people schedule work:
// 7 to 11 in the morning, 12 to 6 in the afternoon or evening.
function settleByHabit(clock: ClockTime): ClockTime {
  if (clock.hours >= 7 && clock.hours <= 11) return { ...clock, settled: true };
  if (clock.hours === 12) return { ...clock, settled: true };
  return { hours: clock.hours + 12, minutes: clock.minutes, settled: true };
}
