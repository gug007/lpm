import { describe, expect, it } from "vitest";
import { readingsMoved } from "./useUsageReads";
import type { AgentLimitsMap } from "./useAgentLimits";

const at = (updatedAt: number): AgentLimitsMap => ({
  "claude:default": { provider: "claude", accountId: "default", updatedAt },
});

describe("readingsMoved", () => {
  it("is false when Refresh brought back the same readings", () => {
    expect(readingsMoved(at(100), at(100))).toBe(false);
  });

  it("is true when any reading is newer", () => {
    expect(readingsMoved(at(100), at(200))).toBe(true);
  });

  it("counts a reading that wasn't there before", () => {
    expect(readingsMoved({}, at(5))).toBe(true);
  });
});
