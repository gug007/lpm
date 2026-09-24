import { HOUR, MINUTE, addDays, atClock, startOfDay } from "./time";

// The Send later line runs from now to a morning at least half a day away. The
// next few hours, where most picks land, are drawn wide and counted from now;
// the rest of the day is narrower and counted on the clock; the night is folded
// down to a sliver, since nobody means 3 AM.

const NEAR_SPAN = 4 * HOUR;
const NEAR_SHARE = 0.46;
export const GAP_SHARE = 0.03;
const NIGHT_WEIGHT = 0.12;
const NIGHT_END_HOUR = 8;
const END_HOUR = 10;
const MIN_SPAN = 12 * HOUR;
const NEAR_STEP = 5 * MINUTE;
// The soonest a prompt can be set for: anything closer is just sending it.
export const MIN_DELAY = NEAR_STEP;

interface Segment {
  t0: number;
  t1: number;
  x0: number;
  x1: number;
  night: boolean;
}

export interface TimelineScale {
  start: number;
  nearEnd: number;
  end: number;
  segments: Segment[];
}

export function timelineEnd(now: number): number {
  let end = atClock(startOfDay(now), END_HOUR, 0);
  while (end - now < MIN_SPAN) end = addDays(end, 1);
  return end;
}

export function buildScale(now: number): TimelineScale {
  const nearEnd = now + NEAR_SPAN;
  const end = timelineEnd(now);
  const pieces: { t0: number; t1: number; weight: number; night: boolean }[] = [];
  for (let t = nearEnd; t < end; ) {
    const day = startOfDay(t);
    const morning = atClock(day, NIGHT_END_HOUR, 0);
    const night = t < morning;
    const boundary = Math.min(night ? morning : addDays(day, 1), end);
    pieces.push({ t0: t, t1: boundary, weight: (boundary - t) * (night ? NIGHT_WEIGHT : 1), night });
    t = boundary;
  }
  const total = pieces.reduce((sum, p) => sum + p.weight, 0);
  const farShare = 1 - NEAR_SHARE - GAP_SHARE;
  const segments: Segment[] = [{ t0: now, t1: nearEnd, x0: 0, x1: NEAR_SHARE, night: false }];
  let x = NEAR_SHARE + GAP_SHARE;
  for (const p of pieces) {
    const dx = total > 0 ? (farShare * p.weight) / total : 0;
    segments.push({ t0: p.t0, t1: p.t1, x0: x, x1: x + dx, night: p.night });
    x += dx;
  }
  return { start: now, nearEnd, end, segments };
}

// Where a moment sits on the line, 0 to 1; anything past the end sits at it.
export function toX(scale: TimelineScale, t: number): number {
  if (t <= scale.start) return 0;
  if (t >= scale.end) return 1;
  const seg = scale.segments.find((s) => t <= s.t1) ?? scale.segments[scale.segments.length - 1];
  if (seg.t1 === seg.t0) return seg.x0;
  return seg.x0 + ((t - seg.t0) / (seg.t1 - seg.t0)) * (seg.x1 - seg.x0);
}

// The moment under a point on the line; the gap between the two halves reads as
// the moment the near half ends.
export function fromX(scale: TimelineScale, x: number): number {
  if (x <= 0) return scale.start;
  if (x >= 1) return scale.end;
  const seg = scale.segments.find((s) => x <= s.x1);
  if (!seg || x < seg.x0) return scale.nearEnd;
  if (seg.x1 === seg.x0) return seg.t0;
  return seg.t0 + ((x - seg.x0) / (seg.x1 - seg.x0)) * (seg.t1 - seg.t0);
}

export function nightBands(scale: TimelineScale): { x0: number; x1: number }[] {
  return scale.segments.filter((s) => s.night).map((s) => ({ x0: s.x0, x1: s.x1 }));
}

function minutesIntoDay(t: number): number {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 + d.getMilliseconds() / 60_000;
}

function snapFar(t: number): number {
  return atClock(startOfDay(t), 0, Math.round(minutesIntoDay(t) / 30) * 30);
}

// The next half hour on the clock strictly past `t` in the given direction.
function nextHalfHour(t: number, dir: 1 | -1): number {
  const halves = minutesIntoDay(t) / 30;
  const k = dir === 1 ? Math.floor(halves) + 1 : Math.ceil(halves) - 1;
  return atClock(startOfDay(t), 0, k * 30);
}

// Five-minute steps counted from now across the near half ("in 2h 5m"), half
// hours on the clock after it ("7:30 PM").
export function snapTime(scale: TimelineScale, t: number): number {
  if (t <= scale.nearEnd) {
    const k = Math.round((t - scale.start) / NEAR_STEP);
    return scale.start + Math.max(1, k) * NEAR_STEP;
  }
  const snapped = snapFar(t);
  if (snapped <= scale.nearEnd) return scale.nearEnd;
  return Math.min(snapped, scale.end);
}

// One snap step along the line, for the arrow keys.
export function stepTime(scale: TimelineScale, t: number, dir: 1 | -1): number {
  if (t < scale.nearEnd || (t === scale.nearEnd && dir === -1)) {
    const k = Math.round((t - scale.start) / NEAR_STEP) + dir;
    const next = scale.start + Math.max(1, k) * NEAR_STEP;
    if (next <= scale.nearEnd) return next;
    return Math.min(nextHalfHour(scale.nearEnd, 1), scale.end);
  }
  const next = nextHalfHour(t, dir);
  if (next <= scale.nearEnd) return scale.nearEnd;
  return Math.min(next, scale.end);
}

export interface TimelineTick {
  t: number;
  x: number;
  // "1h" … "4h" from now on the near half, a clock hour on the far half.
  label: string | null;
  major: boolean;
}

const hourFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric" });

// Minimum room between two labels, in pixels, before the later one is dropped.
const LABEL_SPACING = 40;

export function buildTicks(scale: TimelineScale, widthPx: number): TimelineTick[] {
  const ticks: TimelineTick[] = [];
  for (let k = 1; k * 30 * MINUTE <= NEAR_SPAN; k++) {
    const t = scale.start + k * 30 * MINUTE;
    const whole = k % 2 === 0;
    ticks.push({ t, x: toX(scale, t), label: whole ? `${k / 2}h` : null, major: whole });
  }
  const first = new Date(scale.nearEnd);
  first.setMinutes(0, 0, 0);
  first.setHours(first.getHours() + 1);
  for (let t = first.getTime(); t <= scale.end; t = nextHour(t)) {
    const hour = new Date(t).getHours();
    if (hour > 0 && hour < NIGHT_END_HOUR) continue;
    const label = hour === 0 ? "Midnight" : hour % 2 === 0 ? hourFormat.format(t) : null;
    ticks.push({ t, x: toX(scale, t), label, major: label !== null });
  }
  let lastLabelPx = -Infinity;
  for (const tick of ticks) {
    if (!tick.label) continue;
    const px = tick.x * widthPx;
    if (px - lastLabelPx < LABEL_SPACING || widthPx - px < LABEL_SPACING / 2) {
      tick.label = null;
      continue;
    }
    lastLabelPx = px;
  }
  return ticks;
}

function nextHour(t: number): number {
  const d = new Date(t);
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d.getTime();
}

// The ready-made moments flagged above the line: the end of the working day
// while it's still ahead, and the next working morning.
export function dayMarks(now: number, scale: TimelineScale): { evening: number | null; morning: number } {
  const five = atClock(startOfDay(now), 17, 0);
  const evening = five - now >= 20 * MINUTE ? five : null;
  let morning = atClock(startOfDay(now), 9, 0);
  while (morning - now < HOUR) morning = addDays(morning, 1);
  return { evening, morning: Math.min(morning, scale.end) };
}
