import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatPercent,
  formatTokenCount,
  usagePeriodLabel,
} from "./agentUsageFormat";

describe("formatTokenCount", () => {
  it("keeps small totals exact", () => {
    expect(formatTokenCount(999)).toBe("999");
  });

  it("formats large totals compactly", () => {
    expect(formatTokenCount(1_250)).toBe("1.3K");
    expect(formatTokenCount(12_500)).toBe("13K");
    expect(formatTokenCount(2_400_000)).toBe("2.4M");
  });
});

describe("usagePeriodLabel", () => {
  it("labels supported periods", () => {
    expect(usagePeriodLabel(1)).toBe("today");
    expect(usagePeriodLabel(7)).toBe("the last 7 days");
    expect(usagePeriodLabel(0)).toBe("all time");
  });
});

describe("formatDuration", () => {
  it("renders seconds under a minute", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(59_400)).toBe("59s");
  });

  it("clamps negative input to zero", () => {
    expect(formatDuration(-1_000)).toBe("0s");
  });

  it("renders minutes below an hour", () => {
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(720_000)).toBe("12m");
  });

  it("renders hours with a trimmed decimal", () => {
    expect(formatDuration(3_600_000)).toBe("1h");
    expect(formatDuration(5_400_000)).toBe("1.5h");
  });

  it("renders days, dropping decimals past ten", () => {
    expect(formatDuration(180_000_000)).toBe("2.1d");
    expect(formatDuration(950_400_000)).toBe("11d");
  });
});

describe("formatPercent", () => {
  it("rounds to whole percent by default", () => {
    expect(formatPercent(0.6827)).toBe("68%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0)).toBe("0%");
  });

  it("respects the decimal-place argument", () => {
    expect(formatPercent(0.6827, 1)).toBe("68.3%");
  });

  it("guards non-finite input", () => {
    expect(formatPercent(NaN)).toBe("0%");
    expect(formatPercent(Infinity)).toBe("0%");
    expect(formatPercent(-Infinity)).toBe("0%");
  });
});
