import { describe, expect, it } from "vitest";
import { agentSettingsLine, type SeenAgentRules } from "./agentSettingsLine";

const NOW = 1_000_000_000;
const MIN = 60_000;
const hour: SeenAgentRules = { keep: true, after: { amount: 1, unit: "h" } };
const never: SeenAgentRules = { keep: true, after: null };
const off: SeenAgentRules = { keep: false, after: { amount: 1, unit: "h" } };

describe("agentSettingsLine", () => {
  it("says Archive waits while a turn runs or asks", () => {
    expect(agentSettingsLine({ state: "working" }, hour, NOW)).toBe("Working · Archive waits until the turn ends");
    expect(agentSettingsLine({ state: "working", pause: { since: NOW, shells: ["Build"], key: "claude_code_a" } }, hour, NOW)).toBe(
      "Paused · Archive waits until the turn ends",
    );
    expect(agentSettingsLine({ state: "needs-you" }, hour, NOW)).toBe("Needs you · Archive waits for your answer");
    expect(agentSettingsLine({ state: "idle" }, hour, NOW)).toBe("Idle");
  });

  it("says what opening a new finish will do", () => {
    expect(agentSettingsLine({ state: "done" }, hour, NOW)).toBe(
      "Done · Not opened yet · Once opened, it's archived 1 hour later",
    );
    expect(agentSettingsLine({ state: "error" }, { keep: true, after: { amount: 3, unit: "d" } }, NOW)).toBe(
      "Problem · Not opened yet · Once opened, it's archived 3 days later",
    );
    expect(agentSettingsLine({ state: "done" }, never, NOW)).toBe(
      "Done · Not opened yet · Once opened, it stays until you archive it",
    );
    expect(agentSettingsLine({ state: "done" }, off, NOW)).toBe("Done · Not opened yet · Opening it removes the row");
  });

  it("counts a seen row down to its archive", () => {
    expect(agentSettingsLine({ state: "done", seenAt: NOW - 12 * MIN }, hour, NOW)).toBe(
      "Seen 12m ago · Archived in 48m",
    );
    expect(agentSettingsLine({ state: "done", seenAt: NOW - 20_000 }, hour, NOW)).toBe(
      "Seen just now · Archived in 1h",
    );
    expect(agentSettingsLine({ state: "done", seenAt: NOW - 59.5 * MIN }, hour, NOW)).toBe(
      "Seen 59m ago · Archived within a minute",
    );
    expect(
      agentSettingsLine({ state: "done", seenAt: NOW - 26 * 60 * MIN }, { keep: true, after: { amount: 1, unit: "w" } }, NOW),
    ).toBe("Seen 1d 2h ago · Archived in 5d 22h");
    expect(agentSettingsLine({ state: "done", seenAt: NOW - 90 * MIN }, never, NOW)).toBe(
      "Seen 1h 30m ago · Stays until you archive it",
    );
    expect(agentSettingsLine({ state: "done", seenAt: NOW - MIN }, off, NOW)).toBe("Seen 1m ago · Leaving the sidebar");
  });
});
