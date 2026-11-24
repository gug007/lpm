import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  agentStates,
  answerClose,
  askClose,
  busyTabs,
  cancelClose,
  useCloseGuard,
  type CloseQuestion,
} from "./closeGuard";
import { makeBrowser, makeTerminal } from "./paneTree";
import { STATUS_DONE, STATUS_ERROR, STATUS_RUNNING, STATUS_WAITING, type StatusEntry } from "./types";

const NOW = Date.now();
const entry = (paneID: string, value: string, key = `${paneID}-${value}`): StatusEntry => ({
  key,
  value,
  priority: 0,
  timestamp: NOW,
  paneID,
});

describe("busyTabs", () => {
  const tabs = [makeTerminal("t1", "Claude"), makeTerminal("t2", "Codex"), makeBrowser("b1")];

  it("finds the tabs whose agent is working or waiting for an answer", () => {
    expect(busyTabs(tabs, [entry("t1", STATUS_RUNNING), entry("t2", STATUS_WAITING)], NOW)).toEqual([
      { key: "t1", name: "Claude", count: 1, asking: 0 },
      { key: "t2", name: "Codex", count: 1, asking: 1 },
    ]);
  });

  it("leaves out finished and failed agents, and agents of other tabs", () => {
    expect(
      busyTabs(tabs, [entry("t1", STATUS_DONE), entry("t2", STATUS_ERROR), entry("t9", STATUS_RUNNING)], NOW),
    ).toEqual([]);
    expect(busyTabs(tabs, undefined, NOW)).toEqual([]);
  });

  it("counts every agent of a tab, also one behind a failed one", () => {
    expect(busyTabs(tabs, [entry("t1", STATUS_ERROR), entry("t1", STATUS_RUNNING)], NOW)).toEqual([
      { key: "t1", name: "Claude", count: 1, asking: 0 },
    ]);
    expect(busyTabs(tabs, [entry("t1", STATUS_RUNNING, "a"), entry("t1", STATUS_WAITING, "b")], NOW)).toEqual([
      { key: "t1", name: "Claude", count: 2, asking: 1 },
    ]);
  });
});

describe("agentStates", () => {
  const tabs = ["t1", "t2", "t3", "t4"].map((id) => makeTerminal(id, id));

  it("tells an agent at work from one that is done, one an error stopped, and none", () => {
    const entries = [entry("t1", STATUS_WAITING), entry("t2", STATUS_DONE), entry("t3", STATUS_ERROR)];
    expect([...agentStates(tabs, entries, NOW)].sort()).toEqual([
      ["t1", "pending"],
      ["t2", "done"],
      ["t3", "stopped"],
    ]);
  });

  it("goes by the least finished agent of a tab", () => {
    const entries = [entry("t1", STATUS_DONE), entry("t1", STATUS_RUNNING), entry("t2", STATUS_DONE), entry("t2", STATUS_ERROR)];
    expect(agentStates(tabs, entries, NOW).get("t1")).toBe("pending");
    expect(agentStates(tabs, entries, NOW).get("t2")).toBe("stopped");
  });
});

describe("the close question", () => {
  const question = (): CloseQuestion => ({
    what: "tab",
    agents: [],
    closeNow: vi.fn(),
    closeWhenDone: vi.fn(),
  });

  beforeEach(() => useCloseGuard.setState({ asking: null }));

  it("is put away before its answer runs, and runs it once", () => {
    const q = question();
    q.closeNow = vi.fn(() => expect(useCloseGuard.getState().asking).toBeNull());
    askClose(q);
    answerClose((x) => x.closeNow);
    answerClose((x) => x.closeNow);
    expect(q.closeNow).toHaveBeenCalledOnce();
  });

  it("closes nothing when cancelled", () => {
    const q = question();
    askClose(q);
    cancelClose();
    answerClose((x) => x.closeNow);
    expect(q.closeNow).not.toHaveBeenCalled();
  });
});
