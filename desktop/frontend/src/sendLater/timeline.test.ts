import { describe, expect, it } from "vitest";
import { HOUR, MINUTE } from "./time";
import {
  GAP_SHARE,
  buildScale,
  buildTicks,
  dayMarks,
  fromX,
  nightBands,
  snapTime,
  stepTime,
  timelineEnd,
  toX,
} from "./timeline";

// Thursday, September 24, 2026, 2:48 PM local time.
const NOW = new Date(2026, 8, 24, 14, 48).getTime();
const at = (day: number, h: number, m = 0) => new Date(2026, 8, day, h, m).getTime();

describe("timeline scale", () => {
  const scale = buildScale(NOW);

  it("runs from now to the next morning at least half a day away", () => {
    expect(scale.end).toBe(at(25, 10));
    expect(timelineEnd(new Date(2026, 8, 24, 1, 0).getTime())).toBe(at(25, 10));
    expect(timelineEnd(new Date(2026, 8, 24, 21, 0).getTime())).toBe(at(25, 10));
  });

  it("maps now to 0, the end to 1, and time forward only", () => {
    expect(toX(scale, NOW)).toBe(0);
    expect(toX(scale, scale.end)).toBe(1);
    expect(toX(scale, NOW - HOUR)).toBe(0);
    expect(toX(scale, at(27, 9))).toBe(1);
    let prev = -1;
    for (let t = NOW; t <= scale.end; t += 10 * MINUTE) {
      const x = toX(scale, t);
      expect(x).toBeGreaterThanOrEqual(prev);
      prev = x;
    }
  });

  it("draws the next four hours wider than the rest of the day and folds the night", () => {
    const nearHour = toX(scale, NOW + HOUR) - toX(scale, NOW);
    const eveningHour = toX(scale, at(24, 21)) - toX(scale, at(24, 20));
    const nightHour = toX(scale, at(25, 4)) - toX(scale, at(25, 3));
    expect(nearHour).toBeGreaterThan(eveningHour);
    expect(eveningHour).toBeGreaterThan(nightHour * 4);
    expect(nightBands(scale)).toHaveLength(1);
  });

  it("reads a point back as the moment under it", () => {
    for (const t of [NOW + 90 * MINUTE, at(24, 20, 30), at(25, 9)]) {
      expect(Math.abs(fromX(scale, toX(scale, t)) - t)).toBeLessThan(1000);
    }
    const gapMiddle = toX(scale, scale.nearEnd) + GAP_SHARE / 2;
    expect(fromX(scale, gapMiddle)).toBe(scale.nearEnd);
  });
});

describe("snapping", () => {
  const scale = buildScale(NOW);

  it("counts five-minute steps from now across the near half", () => {
    expect(snapTime(scale, NOW + 2 * HOUR + 2 * MINUTE)).toBe(NOW + 2 * HOUR);
    expect(snapTime(scale, NOW + 2 * HOUR + 3 * MINUTE)).toBe(NOW + 2 * HOUR + 5 * MINUTE);
    expect(snapTime(scale, NOW + MINUTE)).toBe(NOW + 5 * MINUTE);
  });

  it("uses half hours on the clock after it", () => {
    expect(snapTime(scale, at(24, 20, 10))).toBe(at(24, 20));
    expect(snapTime(scale, at(24, 20, 20))).toBe(at(24, 20, 30));
    expect(snapTime(scale, at(26, 9))).toBe(scale.end);
  });

  it("steps one snap at a time with the arrow keys", () => {
    expect(stepTime(scale, NOW + 2 * HOUR, 1)).toBe(NOW + 2 * HOUR + 5 * MINUTE);
    expect(stepTime(scale, NOW + 2 * HOUR, -1)).toBe(NOW + 2 * HOUR - 5 * MINUTE);
    expect(stepTime(scale, NOW + 5 * MINUTE, -1)).toBe(NOW + 5 * MINUTE);
    expect(stepTime(scale, scale.nearEnd, 1)).toBe(at(24, 19));
    expect(stepTime(scale, at(24, 19), -1)).toBe(scale.nearEnd);
    expect(stepTime(scale, at(24, 20), 1)).toBe(at(24, 20, 30));
    expect(stepTime(scale, scale.end, 1)).toBe(scale.end);
  });
});

describe("ticks and marks", () => {
  const scale = buildScale(NOW);

  it("labels hours from now, then clock hours, and never crowds labels", () => {
    const ticks = buildTicks(scale, 440);
    const labels = ticks.filter((t) => t.label).map((t) => t.label);
    expect(labels.slice(0, 4)).toEqual(["1h", "2h", "3h", "4h"]);
    expect(labels).toContain("Midnight");
    const xs = ticks.filter((t) => t.label).map((t) => t.x * 440);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(40);
    expect(ticks.some((t) => new Date(t.t).getHours() === 3)).toBe(false);
  });

  it("offers the end of the day while it's ahead, and the next morning", () => {
    expect(dayMarks(NOW, scale)).toEqual({ evening: at(24, 17), morning: at(25, 9) });
    const late = new Date(2026, 8, 24, 16, 50).getTime();
    expect(dayMarks(late, buildScale(late)).evening).toBeNull();
    const early = new Date(2026, 8, 24, 6, 0).getTime();
    expect(dayMarks(early, buildScale(early)).morning).toBe(at(24, 9));
  });
});
