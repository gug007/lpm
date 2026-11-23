import { describe, expect, it } from "vitest";
import { pauseOf, pauseTooltip, shellsLabel } from "./agentPause";
import { STATUS_DONE, STATUS_RUNNING, type StatusEntry } from "./types";

const entry = (over: Partial<StatusEntry> = {}): StatusEntry => ({
  key: "claude_code_a",
  value: STATUS_RUNNING,
  priority: 0,
  timestamp: 1_000,
  paneID: "%1",
  ...over,
});

describe("pauseOf", () => {
  it("reads a running turn that names the shells it waits on", () => {
    expect(pauseOf(entry({ pausedAt: 5_000, shells: ["Build"] }))).toEqual({ since: 5_000, shells: ["Build"] });
  });

  it("is nothing for a turn that is working, or one that ended", () => {
    expect(pauseOf(entry())).toBeUndefined();
    expect(pauseOf(entry({ pausedAt: 5_000 }))).toBeUndefined();
    expect(pauseOf(entry({ pausedAt: 5_000, shells: [] }))).toBeUndefined();
    expect(pauseOf(entry({ value: STATUS_DONE, pausedAt: 5_000, shells: ["Build"] }))).toBeUndefined();
  });
});

describe("shellsLabel", () => {
  it("counts the shells in Claude's own words", () => {
    expect(shellsLabel({ since: 0, shells: ["a"] })).toBe("1 shell");
    expect(shellsLabel({ since: 0, shells: ["a", "b", "c"] })).toBe("3 shells");
  });
});

describe("pauseTooltip", () => {
  it("leaves the turn's length out when its start was never seen", () => {
    const text = pauseTooltip({ since: 9_000, shells: ["Build"] }, null, "Claude Code in api", "Claude Code");
    expect(text.split("\n")[0]).toBe("Paused — Claude Code in api");
  });
});
