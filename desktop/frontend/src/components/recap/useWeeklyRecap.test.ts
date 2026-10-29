import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WeeklyRecap } from "./weeklyRecapModel";

const loadRecap = vi.fn();

vi.mock("../../../bridge/commands", () => ({
  WeeklyRecap: (...args: unknown[]) => loadRecap(...args),
}));

const { loadWeeklyRecap } = await import("./useWeeklyRecap");

function recap(missing: string[]): WeeklyRecap {
  return {
    week: "2026-10-19",
    days: [],
    previousAgentMs: 0,
    sessions: 0,
    projects: [],
    agents: [],
    workedRepos: [],
    linesAdded: 0,
    linesRemoved: 0,
    missing,
  };
}

describe("loadWeeklyRecap", () => {
  beforeEach(() => loadRecap.mockReset());

  it("asks again, so a computer that has come online since is counted", async () => {
    loadRecap.mockResolvedValueOnce(recap(["build-box"])).mockResolvedValueOnce(recap([]));
    expect((await loadWeeklyRecap("2026-10-19")).missing).toEqual(["build-box"]);
    expect((await loadWeeklyRecap("2026-10-19")).missing).toEqual([]);
    expect(loadRecap).toHaveBeenCalledTimes(2);
  });
});
