import { describe, expect, it } from "vitest";
import { formatTokenCount, usagePeriodLabel } from "./agentUsageFormat";

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
