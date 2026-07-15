import { describe, expect, it } from "vitest";
import type { DailyUsage } from "../../types";
import { nearestIndex, niceMax, stackSegments, visibleDaily } from "./chartScale";

describe("niceMax", () => {
  it("rounds up to the nearest 1/2/5 x 10^n stop", () => {
    expect(niceMax(1)).toBe(1);
    expect(niceMax(50)).toBe(50);
    expect(niceMax(51)).toBe(100);
    expect(niceMax(150_000)).toBe(200_000);
    expect(niceMax(210_000)).toBe(500_000);
    expect(niceMax(600_000)).toBe(1_000_000);
  });

  it("returns a baseline of 1 for empty or invalid maxima", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(-5)).toBe(1);
    expect(niceMax(NaN)).toBe(1);
  });
});

describe("nearestIndex", () => {
  it("maps a pointer to the column it sits over", () => {
    expect(nearestIndex(5, 0, 100, 10)).toBe(0);
    expect(nearestIndex(15, 0, 100, 10)).toBe(1);
    expect(nearestIndex(99, 0, 100, 10)).toBe(9);
  });

  it("clamps past either edge and honors the plot inset", () => {
    expect(nearestIndex(-20, 40, 100, 10)).toBe(0);
    expect(nearestIndex(1_000, 40, 100, 10)).toBe(9);
    expect(nearestIndex(65, 40, 100, 10)).toBe(2);
  });

  it("degrades to a single column", () => {
    expect(nearestIndex(999, 0, 100, 1)).toBe(0);
  });
});

describe("stackSegments", () => {
  const day: DailyUsage = { date: "2026-07-15", claudeTokens: 90, codexTokens: 60, totalTokens: 150 };

  it("scales against niceMax in volume mode", () => {
    const seg = stackSegments(day, "volume", 200);
    expect(seg.claude).toBeCloseTo(0.45, 6);
    expect(seg.codex).toBeCloseTo(0.3, 6);
  });

  it("normalizes to full height in share mode", () => {
    const seg = stackSegments(day, "share", 200);
    expect(seg.claude + seg.codex).toBeCloseTo(1, 6);
  });

  it("guards a zero-total day in share mode", () => {
    const seg = stackSegments({ date: "x", claudeTokens: 0, codexTokens: 0, totalTokens: 0 }, "share", 200);
    expect(seg).toEqual({ claude: 0, codex: 0 });
  });
});

describe("visibleDaily", () => {
  const daily: DailyUsage[] = [
    { date: "a", claudeTokens: 100, codexTokens: 40, totalTokens: 140 },
    { date: "b", claudeTokens: 200, codexTokens: 10, totalTokens: 210 },
  ];

  it("zeroes a hidden provider and recomputes max/total from what remains", () => {
    const result = visibleDaily(daily, { claude: true, codex: false });
    expect(result.days.map((d) => d.totalTokens)).toEqual([100, 200]);
    expect(result.max).toBe(200);
    expect(result.total).toBe(300);
  });
});
