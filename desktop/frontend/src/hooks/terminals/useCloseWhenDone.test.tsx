// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  StopTerminal: vi.fn(async (_id: string) => {}),
  ClearPaneStatus: vi.fn(async () => {}),
  HoldPaneStatus: vi.fn(async () => {}),
  ReleasePaneStatus: vi.fn(async () => {}),
  LoadTerminals: vi.fn(async () => ({})),
  SaveTerminals: vi.fn(async () => {}),
}));
const toast = vi.hoisted(() => ({ show: vi.fn() }));
const held = vi.hoisted(() => ({ files: new Set<string>(), drafts: new Set<string>() }));
vi.mock("../../../bridge/commands", () => bridge);
vi.mock("../../mirror", () => ({ IS_MIRROR_WINDOW: false }));
vi.mock("../../sendLater/closeout", () => ({ onTerminalsClosed: vi.fn() }));
vi.mock("../../components/InteractivePane", () => ({ disposeInteractivePaneSession: vi.fn() }));
vi.mock("../../components/UndoCloseToast", () => ({ showUndoCloseToast: toast.show }));
vi.mock("../../components/files/fileDrafts", () => ({
  hasUnsavedFiles: (id: string) => held.files.has(id),
  forgetFiles: (id: string) => held.files.delete(id),
}));
vi.mock("../../store/composerDrafts", () => ({
  hasComposerText: (id: string) => held.drafts.has(id),
  forgetComposerDraft: vi.fn(),
}));
vi.mock("../../store/app", async () => {
  const { create } = await import("zustand");
  return { useAppStore: create(() => ({ projects: [] as unknown[], refreshProjects: async () => {} })) };
});
vi.mock("../../store/globalAgentStatus", async () => {
  const { create } = await import("zustand");
  return { useGlobalAgentStatus: create(() => ({ entries: [], refresh: async () => {} })) };
});

import { answerClose, useCloseGuard } from "../../closeGuard";
import { collectPanes, collectTerminals, findPane, makePaneLeaf, makeTerminal, mapPane, type PaneNode } from "../../paneTree";
import { useAppStore } from "../../store/app";
import { STATUS_DONE, STATUS_ERROR, STATUS_RUNNING, STATUS_WAITING } from "../../types";
import { useCloseGuardedTabs } from "./useCloseGuardedTabs";
import { useCloseWhenDone } from "./useCloseWhenDone";
import { useTabClose } from "./useTabClose";

let root: Root;
let apply: (next: PaneNode | null) => void;
let guarded: ReturnType<typeof useCloseGuardedTabs>;
let waits: ReturnType<typeof useCloseWhenDone>;
const treeRef: { current: PaneNode | null } = { current: null };
const focusedRef: { current: string | null } = { current: "p1" };

const original: PaneNode = {
  kind: "split",
  direction: "row",
  ratio: 0.5,
  a: makePaneLeaf("p1", [makeTerminal("t1", "Claude"), makeTerminal("t2", "Shell"), makeTerminal("t3", "Codex")]),
  b: makePaneLeaf("p2", [makeTerminal("t4", "Gemini"), makeTerminal("t5", "Logs")]),
};

function Harness() {
  const [tree, setTree] = useState<PaneNode | null>(original);
  treeRef.current = tree;
  const [applyTree] = useState(() => (next: PaneNode | null) => {
    treeRef.current = next;
    setTree(next);
  });
  apply = applyTree;
  const [forward] = useState(() => vi.fn());
  const [getPane] = useState(() => (id: string) => (treeRef.current ? findPane(treeRef.current, id) : null));
  const tabs = useTabClose({ projectName: "web", treeRef, focusedRef, applyTree, forward, getPane });
  waits = useCloseWhenDone({ projectName: "web", tree, treeRef, applyTree, forward, ...tabs });
  guarded = useCloseGuardedTabs({ projectName: "web", treeRef, ...tabs, ...waits });
  return null;
}

function status(byPane: Record<string, string>, over: Record<string, unknown> = {}) {
  const statusEntries = Object.entries(byPane).map(([paneID, value]) => ({
    key: `claude_${paneID}`,
    value,
    priority: 0,
    timestamp: Date.now(),
    paneID,
  }));
  act(() => useAppStore.setState({ projects: [{ name: "web", statusEntries, ...over }] } as never));
}

const ids = () => (treeRef.current ? collectPanes(treeRef.current).map((p) => p.tabs.map((t) => t.id)) : []);
const asking = () => useCloseGuard.getState().asking;
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const marks = () => collectTerminals(treeRef.current!).filter((t) => t.closeWhenDone).map((t) => t.id);
const run = (fn: () => void) => act(fn);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  held.files.clear();
  held.drafts.clear();
  Object.values(bridge).forEach((fn) => fn.mockClear());
  toast.show.mockClear();
  useCloseGuard.setState({ asking: null });
  useAppStore.setState({ projects: [{ name: "web", statusEntries: [] }] } as never);
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe("closing a tab", () => {
  it("is at once, and unasked, when its agent is idle", () => {
    status({ t1: STATUS_DONE });
    run(() => guarded.requestCloseTab("p1", 0));
    expect(asking()).toBeNull();
    expect(ids()[0]).toEqual(["t2", "t3"]);
    expect(toast.show.mock.calls[0][0].detail).toBeUndefined();
  });

  it("asks first while its agent works, and Cancel leaves it", () => {
    status({ t1: STATUS_RUNNING });
    run(() => guarded.requestCloseTab("p1", 0));
    expect(asking()).toMatchObject({ what: "tab", agents: [{ key: "t1", name: "Claude", count: 1, asking: 0 }] });
    expect(ids()[0]).toEqual(["t1", "t2", "t3"]);
  });

  it("closes the tab it asked about, wherever it has moved, behind an Undo that says an agent runs", () => {
    status({ t3: STATUS_WAITING });
    run(() => guarded.requestCloseTab("p1", 2));
    run(() => guarded.requestCloseTab("p1", 0));
    run(() => answerClose((q) => q.closeNow));
    expect(ids()[0]).toEqual(["t2"]);
    expect(toast.show.mock.calls.at(-1)![0]).toMatchObject({ title: "Codex closed", detail: "agent running" });
  });

  it("waits for the agent, then closes behind the usual Undo", async () => {
    status({ t1: STATUS_RUNNING });
    run(() => guarded.requestCloseTab("p1", 0));
    run(() => answerClose((q) => q.closeWhenDone));
    await tick(60_000);
    expect(ids()[0]).toEqual(["t1", "t2", "t3"]);

    status({ t1: STATUS_DONE });
    await tick(2_999);
    expect(ids()[0]).toEqual(["t1", "t2", "t3"]);
    await tick(1);
    expect(ids()[0]).toEqual(["t2", "t3"]);
    expect(toast.show).toHaveBeenCalledOnce();
    expect(toast.show.mock.calls[0][0].detail).toBeUndefined();
  });

  it("keeps waiting when the agent starts another turn right away", async () => {
    status({ t1: STATUS_RUNNING });
    run(() => waits.closeTabWhenDone("t1"));
    status({ t1: STATUS_DONE });
    await tick(1_000);
    status({ t1: STATUS_RUNNING });
    await tick(10_000);
    expect(ids()[0]).toContain("t1");
    status({ t1: STATUS_DONE });
    await tick(3_000);
    expect(ids()[0]).not.toContain("t1");
  });

  it("asks once more before it closes, and stays when another turn had begun", async () => {
    status({ t1: STATUS_RUNNING });
    run(() => waits.closeTabWhenDone("t1"));
    status({ t1: STATUS_DONE });
    const refresh = vi.spyOn(useAppStore.getState(), "refreshProjects");
    refresh.mockImplementation(async () => status({ t1: STATUS_RUNNING }));
    await tick(3_000);
    expect(ids()[0]).toContain("t1");
    expect(marks()).toEqual(["t1"]);
    refresh.mockRestore();
  });

  it("closes a moment after the answer when the agent was done by then", async () => {
    status({ t1: STATUS_RUNNING });
    run(() => guarded.requestCloseTab("p1", 0));
    status({ t1: STATUS_DONE });
    run(() => answerClose((q) => q.closeWhenDone));
    expect(ids()[0]).toContain("t1");
    await tick(3_000);
    expect(ids()[0]).toEqual(["t2", "t3"]);
  });

  it.each([
    ["is interrupted, or its agent quits", {}],
    ["stops on an error or a limit", { t1: STATUS_ERROR }],
  ])("stays, and waits no more, when the turn %s", async (_what, after) => {
    status({ t1: STATUS_RUNNING });
    run(() => waits.closeTabWhenDone("t1"));
    status(after as Record<string, string>);
    expect(marks()).toEqual([]);
    status({ t1: STATUS_RUNNING });
    status({ t1: STATUS_DONE });
    await tick(10_000);
    expect(ids()[0]).toContain("t1");
  });

  it("stays when someone comes to look at the finish", async () => {
    status({ t1: STATUS_RUNNING });
    run(() => waits.closeTabWhenDone("t1"));
    status({ t1: STATUS_DONE });
    await tick(1_500);
    status({});
    await tick(10_000);
    expect(ids()[0]).toContain("t1");
    expect(marks()).toEqual([]);
  });

  it("stays while something is written in its composer", async () => {
    status({ t1: STATUS_RUNNING });
    run(() => waits.closeTabWhenDone("t1"));
    held.drafts.add("t1");
    status({ t1: STATUS_DONE });
    await tick(3_000);
    expect(ids()[0]).toContain("t1");
    expect(marks()).toEqual([]);
  });

  it("stays when asked to be kept open, from the menu or from the next ⌘W", async () => {
    status({ t1: STATUS_RUNNING });
    run(() => waits.closeTabWhenDone("t1"));
    run(() => guarded.requestCloseTab("p1", 0));
    expect(asking()?.keepOpen).toBeDefined();
    run(() => answerClose((q) => q.keepOpen));
    status({ t1: STATUS_DONE });
    await tick(10_000);
    expect(ids()[0]).toContain("t1");
  });

  it("holds on while its computer is away or isn't answering", async () => {
    status({ t1: STATUS_RUNNING });
    run(() => waits.closeTabWhenDone("t1"));
    act(() => useAppStore.setState({ projects: [] } as never));
    await tick(10_000);
    status({}, { statusUnknown: true });
    await tick(10_000);
    status({ t1: STATUS_DONE }, { statusUnknown: true });
    await tick(10_000);
    expect(ids()[0]).toContain("t1");
    expect(marks()).toEqual(["t1"]);
    status({ t1: STATUS_DONE });
    await tick(3_000);
    expect(ids()[0]).not.toContain("t1");
  });

  it("never marks a pinned tab, which doesn't close", () => {
    act(() => apply(mapPane(treeRef.current!, "p1", (p) => ({ ...p, tabs: p.tabs.map((t) => ({ ...t, pinned: true })) }))));
    status({ t1: STATUS_RUNNING });
    run(() => waits.closeTabWhenDone("t1"));
    expect(marks()).toEqual([]);
  });

  it("waits no more once an Undo brought it back", async () => {
    status({ t1: STATUS_RUNNING });
    run(() => waits.closeTabWhenDone("t1"));
    status({ t1: STATUS_DONE });
    await tick(3_000);
    run(() => toast.show.mock.calls[0][0].onUndo());
    expect(ids()[0]).toEqual(["t1", "t2", "t3"]);
    status({ t1: STATUS_RUNNING });
    status({ t1: STATUS_DONE });
    await tick(10_000);
    expect(ids()[0]).toEqual(["t1", "t2", "t3"]);
  });
});

describe("closing the other tabs", () => {
  it("asks only when one of them has an agent mid-task", () => {
    status({ t1: STATUS_RUNNING });
    run(() => guarded.requestCloseOthers("p1", 0));
    expect(asking()).toBeNull();
    expect(ids()[0]).toEqual(["t1"]);
  });

  it("closes the idle ones now and the rest as they finish", async () => {
    status({ t1: STATUS_RUNNING, t2: STATUS_DONE });
    run(() => guarded.requestCloseOthers("p1", 2));
    expect(asking()).toMatchObject({ what: "others", agents: [{ key: "t1" }] });
    run(() => answerClose((q) => q.closeWhenDone));
    expect(ids()[0]).toEqual(["t1", "t3"]);
    expect(findPane(treeRef.current!, "p1")!.activeTabIdx).toBe(1);

    status({ t1: STATUS_DONE });
    await tick(3_000);
    expect(ids()[0]).toEqual(["t3"]);
  });

  it("closes them all now when told to", () => {
    status({ t1: STATUS_RUNNING });
    run(() => guarded.requestCloseOthers("p1", 2));
    run(() => answerClose((q) => q.closeNow));
    expect(ids()[0]).toEqual(["t3"]);
  });

  it("reads what the agents do before a phone's request closes the idle ones", async () => {
    const refresh = vi.spyOn(useAppStore.getState(), "refreshProjects");
    refresh.mockImplementation(async () => status({ t4: STATUS_RUNNING }));
    await act(() => waits.closeOthersEverywhereWhenDone("t1"));
    expect(ids()).toEqual([["t1"], ["t4"]]);
    expect(marks()).toEqual(["t4"]);
    refresh.mockRestore();
  });
});

describe("closing a pane", () => {
  const closePane = () => {
    status({ t4: STATUS_RUNNING, t5: STATUS_RUNNING });
    run(() => guarded.requestClosePane("p2"));
    run(() => answerClose((q) => q.closeWhenDone));
  };
  const whole = [["t1", "t2", "t3"], ["t4", "t5"]];

  it("waits for every agent in it, then goes whole behind one Undo", async () => {
    closePane();
    status({ t4: STATUS_DONE, t5: STATUS_RUNNING });
    await tick(10_000);
    expect(ids()).toEqual(whole);
    // Its first agent's answer was read while the other still worked.
    status({ t5: STATUS_RUNNING });
    status({ t5: STATUS_DONE });
    await tick(3_000);
    expect(ids()).toEqual([["t1", "t2", "t3"]]);
    expect(toast.show).toHaveBeenCalledOnce();
    run(() => toast.show.mock.calls[0][0].onUndo());
    expect(ids()).toEqual(whole);
    expect(marks()).toEqual([]);
  });

  it("stays when one of its agents stops before it is done", async () => {
    closePane();
    status({ t4: STATUS_DONE, t5: STATUS_ERROR });
    await tick(10_000);
    expect(ids()).toEqual(whole);
    expect(marks()).toEqual([]);
  });

  it("stays with unsaved edits in it", async () => {
    closePane();
    held.files.add("t5");
    status({ t4: STATUS_DONE, t5: STATUS_DONE });
    await tick(3_000);
    expect(ids()).toEqual(whole);
    expect(held.files.has("t5")).toBe(true);
    expect(marks()).toEqual([]);
  });

  it("closes only its agent, behind Undo, once a tab was opened in it", async () => {
    status({ t4: STATUS_RUNNING });
    run(() => guarded.requestClosePane("p2"));
    run(() => answerClose((q) => q.closeWhenDone));
    act(() => apply(mapPane(treeRef.current!, "p2", (p) => ({ ...p, tabs: [...p.tabs, makeTerminal("t6", "New")] }))));
    expect(marks()).toEqual(["t4"]);
    status({ t4: STATUS_DONE });
    await tick(3_000);
    expect(ids()[1]).toEqual(["t5", "t6"]);
    expect(toast.show).toHaveBeenCalledOnce();
    expect(bridge.StopTerminal).not.toHaveBeenCalled();
  });

  it("closes nothing once its agent's tab was replaced or kept", async () => {
    status({ t4: STATUS_RUNNING });
    run(() => guarded.requestClosePane("p2"));
    run(() => answerClose((q) => q.closeWhenDone));
    act(() =>
      apply(
        mapPane(treeRef.current!, "p2", (p) => ({
          ...p,
          tabs: p.tabs.map((t) => (t.id === "t4" ? makeTerminal("t9", "Claude") : t)),
        })),
      ),
    );
    expect(marks()).toEqual([]);
    status({});
    await tick(10_000);
    expect(ids()[1]).toEqual(["t9", "t5"]);
    expect(bridge.StopTerminal).not.toHaveBeenCalled();
  });

  it("lets a tab moved to another pane stay", async () => {
    closePane();
    const moved = collectTerminals(treeRef.current!).find((t) => t.id === "t5")!;
    act(() => {
      const without = mapPane(treeRef.current!, "p2", (p) => ({ ...p, tabs: p.tabs.filter((t) => t.id !== "t5") }));
      apply(mapPane(without, "p1", (p) => ({ ...p, tabs: [...p.tabs, moved] })));
    });
    status({ t4: STATUS_RUNNING });
    expect(marks()).not.toContain("t2");
    status({ t4: STATUS_DONE, t5: STATUS_RUNNING });
    await tick(3_000);
    expect(ids()).toEqual([["t1", "t2", "t3", "t5"]]);
  });
});
