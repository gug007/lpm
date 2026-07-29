import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  loadTerminals: vi.fn(),
  saveTerminals: vi.fn(() => Promise.resolve()),
}));

vi.mock(
  "../bridge/commands",
  () =>
    new Proxy(
      {},
      {
        has: () => true,
        get: (_t, prop) => {
          if (prop === "then") return undefined;
          if (prop === "LoadTerminals") return h.loadTerminals;
          if (prop === "SaveTerminals") return h.saveTerminals;
          return vi.fn();
        },
      },
    ),
);
vi.mock("../bridge/models", () => ({
  main: { TerminalsConfig: { createFrom: (v: unknown) => v } },
}));

import {
  collectPersistedTabs,
  getProjectTerminals,
  loadTerminals,
  rememberLostSessions,
  saveProjectTerminals,
  subscribeTerminalsChanged,
  updateProjectTerminalsCache,
  type ProjectTerminalState,
} from "./terminals";

const seed = async (state: ProjectTerminalState) => {
  h.loadTerminals.mockResolvedValue({ projects: { proj: state } });
  await loadTerminals();
};

describe("rememberLostSessions", () => {
  beforeEach(() => {
    h.saveTerminals.mockClear();
  });

  it("files resumable tabs into history so a lost session stays reachable", async () => {
    await seed({ detailView: "terminal" });

    await rememberLostSessions("proj", [
      {
        label: "Claude",
        sessionTitle: "Fix terminal links",
        sessionTitleId: "abc",
        sessionTitleSource: "vendor",
        actionName: "claude",
        startCmd: "claude",
        resumeCmd: "claude --resume abc",
      },
      { label: "Server", actionName: "server" },
    ]);

    const history = getProjectTerminals("proj").history ?? [];
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      label: "Claude",
      sessionTitle: "Fix terminal links",
      sessionTitleId: "abc",
      sessionTitleSource: "vendor",
      actionName: "claude",
      startCmd: "claude",
      resumeCmd: "claude --resume abc",
    });
    expect(h.saveTerminals).toHaveBeenCalledTimes(1);
  });

  it("leaves the saved panes untouched", async () => {
    const panes = { kind: "leaf", tabs: [{ label: "Claude" }], activeTabIdx: 0 };
    await seed({ detailView: "terminal", panes });

    await rememberLostSessions("proj", [{ label: "Claude", resumeCmd: "claude --resume abc" }]);

    expect(getProjectTerminals("proj").panes).toEqual(panes);
  });

  it("does not write when no tab can be resumed", async () => {
    await seed({ detailView: "terminal" });

    await rememberLostSessions("proj", [{ label: "Server", actionName: "server" }]);

    expect(h.saveTerminals).not.toHaveBeenCalled();
    expect(getProjectTerminals("proj").history).toBeUndefined();
  });

  it("moves an already-known session to the top instead of duplicating it", async () => {
    await seed({
      detailView: "terminal",
      history: [
        { label: "Claude", resumeCmd: "claude --resume abc", closedAt: 1 },
        { label: "Other", resumeCmd: "claude --resume def", closedAt: 2 },
      ],
    });

    await rememberLostSessions("proj", [{ label: "Claude", resumeCmd: "claude --resume abc" }]);

    const history = getProjectTerminals("proj").history ?? [];
    expect(history.map((e) => e.resumeCmd)).toEqual([
      "claude --resume abc",
      "claude --resume def",
    ]);
    expect(history[0].closedAt).toBeGreaterThan(1);
  });
});

describe("subscribeTerminalsChanged", () => {
  it("notifies on a disk write and on a cache-only staging", async () => {
    await seed({ detailView: "terminal" });
    const listener = vi.fn();
    const unsubscribe = subscribeTerminalsChanged(listener);

    await saveProjectTerminals("proj", {
      detailView: "terminal",
      history: [{ label: "Claude", resumeCmd: "claude --resume abc", closedAt: 1 }],
    });
    expect(listener).toHaveBeenCalledTimes(1);

    updateProjectTerminalsCache("proj", { detailView: "terminal" });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("sees the new state synchronously, before the write settles", async () => {
    await seed({ detailView: "terminal" });
    const seen: (number | undefined)[] = [];
    const unsubscribe = subscribeTerminalsChanged(() => {
      seen.push(getProjectTerminals("proj").history?.length);
    });

    const pending = saveProjectTerminals("proj", {
      detailView: "terminal",
      history: [{ label: "Claude", resumeCmd: "claude --resume abc", closedAt: 1 }],
    });
    expect(seen).toEqual([1]);

    await pending;
    unsubscribe();
  });

  it("stops notifying once unsubscribed", async () => {
    await seed({ detailView: "terminal" });
    const listener = vi.fn();
    subscribeTerminalsChanged(listener)();

    await saveProjectTerminals("proj", { detailView: "terminal" });
    updateProjectTerminalsCache("proj", { detailView: "terminal" });

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("collectPersistedTabs", () => {
  it("walks both sides of a split", () => {
    const tabs = collectPersistedTabs({
      kind: "split",
      direction: "row",
      ratio: 0.5,
      a: { kind: "leaf", tabs: [{ label: "A" }], activeTabIdx: 0 },
      b: {
        kind: "split",
        direction: "col",
        ratio: 0.5,
        a: { kind: "leaf", tabs: [{ label: "B" }], activeTabIdx: 0 },
        b: { kind: "leaf", tabs: [{ label: "C" }], activeTabIdx: 0 },
      },
    });

    expect(tabs.map((t) => t.label)).toEqual(["A", "B", "C"]);
  });

  it("is empty for a missing tree", () => {
    expect(collectPersistedTabs(undefined)).toEqual([]);
  });
});
