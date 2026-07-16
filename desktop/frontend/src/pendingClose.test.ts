import { describe, it, expect, beforeEach } from "vitest";
import {
  isPendingClose,
  pendingClosesForProject,
  registerPendingClose,
  takePendingClose,
  type PendingClose,
} from "./pendingClose";
import { type TerminalInstance } from "./paneTree";

function tab(id: string, label = id): TerminalInstance {
  return { id, label };
}

function entry(id: string, project = "proj"): PendingClose {
  return {
    tab: tab(id),
    paneId: "pane-1",
    tabIdx: 0,
    projectName: project,
    toastId: `close-tab-${id}`,
    finalized: false,
  };
}

// The registry is module-global; drain it between tests so cases don't bleed.
beforeEach(() => {
  for (const p of pendingClosesForProject("proj")) takePendingClose(p.tab.id);
  for (const p of pendingClosesForProject("other")) takePendingClose(p.tab.id);
});

describe("pendingClose registry", () => {
  it("reports membership after register", () => {
    expect(isPendingClose("t1")).toBe(false);
    registerPendingClose(entry("t1"));
    expect(isPendingClose("t1")).toBe(true);
  });

  it("take removes the entry so it can only be claimed once", () => {
    registerPendingClose(entry("t1"));
    const first = takePendingClose("t1");
    expect(first?.tab.id).toBe("t1");
    expect(isPendingClose("t1")).toBe(false);
    expect(takePendingClose("t1")).toBeUndefined();
  });

  it("take of an unknown id is a no-op", () => {
    expect(takePendingClose("missing")).toBeUndefined();
  });

  it("preserves the captured restore location", () => {
    const e = entry("t1");
    e.paneId = "pane-42";
    e.tabIdx = 3;
    registerPendingClose(e);
    const taken = takePendingClose("t1");
    expect(taken?.paneId).toBe("pane-42");
    expect(taken?.tabIdx).toBe(3);
  });

  it("scopes listing by project", () => {
    registerPendingClose(entry("a", "proj"));
    registerPendingClose(entry("b", "proj"));
    registerPendingClose(entry("c", "other"));
    expect(pendingClosesForProject("proj").map((e) => e.tab.id).sort()).toEqual(["a", "b"]);
    expect(pendingClosesForProject("other").map((e) => e.tab.id)).toEqual(["c"]);
  });
});
