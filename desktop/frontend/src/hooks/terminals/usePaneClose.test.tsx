// @vitest-environment happy-dom
import { act } from "react";
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
vi.mock("../../../bridge/commands", () => bridge);
vi.mock("../../mirror", () => ({ IS_MIRROR_WINDOW: false }));
vi.mock("../../sendLater/closeout", () => ({ onTerminalsClosed: vi.fn() }));
vi.mock("../../components/InteractivePane", () => ({ disposeInteractivePaneSession: vi.fn() }));
vi.mock("../../components/UndoCloseToast", async (actual) => {
  const real = await actual<typeof import("../../components/UndoCloseToast")>();
  toast.show.mockImplementation(real.showUndoCloseToast);
  return { ...real, showUndoCloseToast: toast.show };
});
vi.mock("../../projectStatusEntries", () => ({
  projectStatusEntries: () => [{ paneID: "t1", value: "Running", key: "claude" }],
}));

import { isPendingClose } from "../../pendingClose";
import { makePaneLeaf, makeTerminal, type PaneNode } from "../../paneTree";
import { useTabClose } from "./useTabClose";

let root: Root;
let api: ReturnType<typeof useTabClose>;
const treeRef: { current: PaneNode | null } = { current: null };
const focusedRef: { current: string | null } = { current: "p1" };
const applyTree = vi.fn((next: PaneNode | null) => {
  treeRef.current = next;
});

const original: PaneNode = {
  kind: "split",
  direction: "row",
  ratio: 0.4,
  a: makePaneLeaf("p1", [makeTerminal("t1", "Claude", { historyKey: "h1" }), makeTerminal("t2", "Shell", { historyKey: "h2" })], 1),
  b: makePaneLeaf("p2", [makeTerminal("t3", "Codex", { historyKey: "h3" })]),
};

function Harness() {
  api = useTabClose({
    projectName: "web",
    treeRef,
    focusedRef,
    applyTree,
    forward: vi.fn(),
    getPane: () => null,
  });
  return null;
}

function lastToast() {
  return toast.show.mock.calls.at(-1)![0] as {
    title: string;
    detail?: string;
    onUndo: () => void;
    onFinalize: () => void;
  };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.values(bridge).forEach((fn) => fn.mockClear());
  toast.show.mockClear();
  applyTree.mockClear();
  treeRef.current = original;
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
});

describe("closing a pane", () => {
  it("drops the pane at once but keeps its tabs running behind the toast", () => {
    api.closePane("p1");
    expect(treeRef.current).toEqual(original.b);
    expect(bridge.StopTerminal).not.toHaveBeenCalled();
    expect(isPendingClose("t1")).toBe(true);
    expect(bridge.HoldPaneStatus).toHaveBeenCalledTimes(2);
    expect(lastToast()).toMatchObject({ title: "Pane closed", detail: "2 tabs, 1 agent running" });
    lastToast().onFinalize();
  });

  it("undo puts the pane back where it was, with its tabs and active tab", () => {
    api.closePane("p1");
    lastToast().onUndo();
    expect(treeRef.current).toEqual(original);
    expect(applyTree).toHaveBeenLastCalledWith(original, "p1");
    expect(bridge.ReleasePaneStatus).toHaveBeenCalledTimes(2);
    expect(bridge.StopTerminal).not.toHaveBeenCalled();
    expect(isPendingClose("t1")).toBe(false);
  });

  it("stops every tab once the undo window ends, and only once", () => {
    api.closePane("p1");
    const { onFinalize, onUndo } = lastToast();
    onFinalize();
    onFinalize();
    onUndo();
    expect(bridge.StopTerminal.mock.calls.map(([id]) => id)).toEqual(["t1", "t2"]);
    expect(treeRef.current).toEqual(original.b);
  });

  it("stops them on time in a hidden window, and leaves a shown one to its toast", async () => {
    vi.useFakeTimers();
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    api.closePane("p1");
    await vi.advanceTimersByTimeAsync(4_900);
    expect(bridge.StopTerminal).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(bridge.StopTerminal.mock.calls.map(([id]) => id)).toEqual(["t1", "t2"]);

    hidden.mockReturnValue(false);
    api.closePane("p2");
    await vi.advanceTimersByTimeAsync(6_000);
    expect(bridge.StopTerminal).toHaveBeenCalledTimes(2);
    hidden.mockRestore();
    vi.useRealTimers();
    lastToast().onUndo();
  });

  it("stops held tabs when the project view goes away", () => {
    api.closePane("p2");
    api.finalizePendingClosesForProject();
    expect(bridge.StopTerminal.mock.calls.map(([id]) => id)).toEqual(["t3"]);
    expect(isPendingClose("t3")).toBe(false);
  });
});
