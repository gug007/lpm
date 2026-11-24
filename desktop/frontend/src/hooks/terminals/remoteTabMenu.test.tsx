// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  StopTerminal: vi.fn(async () => {}),
  ClearPaneStatus: vi.fn(async () => {}),
  HoldPaneStatus: vi.fn(async () => {}),
  ReleasePaneStatus: vi.fn(async () => {}),
  LoadTerminals: vi.fn(async () => ({})),
  SaveTerminals: vi.fn(async () => {}),
}));
vi.mock("../../../bridge/commands", () => bridge);
vi.mock("../../mirror", () => ({ IS_MIRROR_WINDOW: false }));
vi.mock("../../sendLater/closeout", () => ({ onTerminalsClosed: vi.fn() }));
vi.mock("../../components/InteractivePane", () => ({ disposeInteractivePaneSession: vi.fn() }));
vi.mock("../../components/UndoCloseToast", () => ({ showUndoCloseToast: vi.fn() }));
vi.mock("../../projectStatusEntries", () => ({ projectStatusEntries: () => [] }));

import {
  collectPanes,
  makeBrowser,
  makePaneLeaf,
  makeTerminal,
  type PaneNode,
} from "../../paneTree";
import { useRemoteTabControls } from "./useRemoteTabControls";
import { useTabClose } from "./useTabClose";

let root: Root;
let controls: ReturnType<typeof useRemoteTabControls>;
const treeRef: { current: PaneNode | null } = { current: null };
const focusedRef: { current: string | null } = { current: "p1" };
const restoreSettled = { current: Promise.resolve() };
const applyTree = vi.fn((next: PaneNode | null) => {
  treeRef.current = next;
});
const forkTerminal = vi.fn(async () => {});
const forkTerminalIntoCopy = vi.fn(async () => {});

function Harness() {
  const { closeTerminal, closeTerminalsById } = useTabClose({
    projectName: "web",
    treeRef,
    focusedRef,
    applyTree,
    forward: vi.fn(),
    getPane: () => null,
  });
  controls = useRemoteTabControls({
    treeRef,
    restoreSettled,
    closeTerminal,
    closeTabWhenDone: vi.fn(),
    closeOthersEverywhereWhenDone: vi.fn(async () => {}),
    keepOpen: vi.fn(),
    renameTerminal: vi.fn(),
    restoreSessionTitle: vi.fn(),
    toggleTabPinned: vi.fn(),
    reorderTerminals: vi.fn(),
    closeTerminalsById,
    forkTerminal,
    forkTerminalIntoCopy,
  });
  return null;
}

const ids = () =>
  collectPanes(treeRef.current!).map((p) => p.tabs.map((t) => t.id));

const settle = () => act(async () => {});

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.values(bridge).forEach((fn) => fn.mockClear());
  applyTree.mockClear();
  forkTerminal.mockClear();
  forkTerminalIntoCopy.mockClear();
  focusedRef.current = "p1";
  treeRef.current = {
    kind: "split",
    direction: "row",
    ratio: 0.5,
    a: makePaneLeaf("p1", [
      makeTerminal("t1", "Claude"),
      makeTerminal("t2", "Shell", { pinned: true }),
      makeBrowser("b1"),
    ]),
    b: makePaneLeaf("p2", [makeTerminal("t3", "Codex")]),
  };
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
});

describe("remote tab menu", () => {
  it("closes every other unpinned terminal in any pane, at once", async () => {
    controls.remoteCloseOthers("t1");
    await settle();
    expect(ids()).toEqual([["t1", "t2", "b1"]]);
    expect(bridge.StopTerminal).toHaveBeenCalledTimes(1);
    expect(bridge.StopTerminal).toHaveBeenCalledWith("t3");
    expect(applyTree).toHaveBeenCalledTimes(1);
  });

  it("moves focus off a pane it emptied", async () => {
    focusedRef.current = "p2";
    controls.remoteCloseOthers("t1");
    await settle();
    expect(applyTree).toHaveBeenLastCalledWith(expect.anything(), "p1");
  });

  it("closes nothing when the kept tab is already gone", async () => {
    controls.remoteCloseOthers("gone");
    await settle();
    expect(ids()).toEqual([["t1", "t2", "b1"], ["t3"]]);
    expect(applyTree).not.toHaveBeenCalled();
  });

  it("forks a tab in the pane that holds it", async () => {
    controls.remoteForkTerminal("t3");
    await settle();
    expect(forkTerminal).toHaveBeenCalledWith("p2", "t3");
  });

  it("forks a tab into a copy without asking again", async () => {
    controls.remoteForkIntoCopy("t1");
    await settle();
    expect(forkTerminalIntoCopy).toHaveBeenCalledWith("p1", "t1");
  });
});
