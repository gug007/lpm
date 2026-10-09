import { describe, expect, it, vi } from "vitest";

vi.mock("../../bridge/commands", () => ({}));
vi.mock("../../bridge/runtime", () => ({ EventsOn: () => () => {} }));
vi.mock("./settings", () => ({ useSettingsStore: { subscribe: () => () => {} } }));

import { pendingSuggestion, type ClaudePool, type PoolView } from "./claudePool";

const pool = (over: Partial<ClaudePool> = {}): ClaudePool => ({
  enabled: true,
  active: true,
  mode: "ask",
  consented: true,
  unavailable: null,
  paused: null,
  held: null,
  switchAt: 90,
  maxMembers: 3,
  main: ["default", "work"],
  allowed: [],
  accounts: [],
  pools: [],
  ...over,
});

const view: PoolView = {
  key: "__main__",
  project: null,
  members: ["default", "work"],
  current: "default",
  pick: { id: "work", kind: "first", skipped: [] },
};

describe("pendingSuggestion", () => {
  it("asks when the pick differs from the account in use", () => {
    expect(pendingSuggestion(pool(), view, {})?.id).toBe("work");
  });

  it("stays quiet in automatic mode, while paused, or when switching is off", () => {
    expect(pendingSuggestion(pool({ mode: "auto" }), view, {})).toBeNull();
    expect(pendingSuggestion(pool({ paused: "hold" }), view, {})).toBeNull();
    expect(pendingSuggestion(pool({ active: false }), view, {})).toBeNull();
  });

  it("stays quiet after Not now until the suggestion changes", () => {
    expect(pendingSuggestion(pool(), view, { __main__: "default>work" })).toBeNull();
    expect(pendingSuggestion(pool(), view, { __main__: "default>side" })?.id).toBe("work");
  });

  it("stays quiet when the pick is already in use", () => {
    expect(pendingSuggestion(pool(), { ...view, current: "work" }, {})).toBeNull();
  });
});
