import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({ AnswerTabRequest: vi.fn(async (..._args: unknown[]) => {}) }));
vi.mock("../../bridge/commands", () => bridge);

import { reportOpenedTab, startsTurn } from "./openedTab";

beforeEach(() => bridge.AnswerTabRequest.mockClear());

describe("startsTurn", () => {
  it.each([
    ["claude", true, true],
    ["claude 'fix the spec'", false, true],
    ["./claude --model opus 'fix it'", false, true],
    ["claude", false, false],
    ["claude --dangerously-skip-permissions", false, false],
    ["npm test", true, false],
    ["", true, false],
  ] as [string, boolean, boolean][])("%s, prompted %s: %s", (cmd, prompted, starts) => {
    expect(startsTurn(cmd, prompted)).toBe(starts);
  });
});

describe("reportOpenedTab", () => {
  it("answers with the tab, whether it was already open, and that an agent is about to work", () => {
    reportOpenedTab(7, { tab: { id: "api-1", reused: false }, cmd: "claude", prompted: true });
    reportOpenedTab(8, { tab: { id: "api-2", reused: true }, cmd: "npm run dev" });
    expect(bridge.AnswerTabRequest.mock.calls).toEqual([
      [7, { tab: "api-1", reused: false, startsTurn: true }],
      [8, { tab: "api-2", reused: true, startsTurn: false }],
    ]);
  });

  it("says when there is no tab, and why one couldn't open", () => {
    reportOpenedTab(9, {});
    reportOpenedTab(10, { error: "couldn't open a terminal in api" });
    expect(bridge.AnswerTabRequest.mock.calls).toEqual([
      [9, { tab: null, reused: false, startsTurn: false }],
      [10, { tab: null, reused: false, startsTurn: false, error: "couldn't open a terminal in api" }],
    ]);
  });
});
