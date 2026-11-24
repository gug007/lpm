// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../bridge/commands", () => ({}));
vi.mock("../../mirror", () => ({ IS_MIRROR_WINDOW: true }));
vi.mock("../../sendLater/closeout", () => ({ onTerminalsClosed: vi.fn() }));
vi.mock("../../components/InteractivePane", () => ({ disposeInteractivePaneSession: vi.fn() }));
vi.mock("../../components/UndoCloseToast", () => ({ showUndoCloseToast: vi.fn() }));
vi.mock("../../store/app", async () => {
  const { create } = await import("zustand");
  return { useAppStore: create(() => ({ projects: [] as unknown[], refreshProjects: async () => {} })) };
});
vi.mock("../../store/globalAgentStatus", async () => {
  const { create } = await import("zustand");
  return { useGlobalAgentStatus: create(() => ({ entries: [], refresh: async () => {} })) };
});

import { answerClose, useCloseGuard } from "../../closeGuard";
import { findPane, makePaneLeaf, makeTerminal, type PaneNode } from "../../paneTree";
import { useAppStore } from "../../store/app";
import { STATUS_RUNNING } from "../../types";
import { useCloseGuardedTabs } from "./useCloseGuardedTabs";
import { useCloseWhenDone } from "./useCloseWhenDone";
import { useTabClose } from "./useTabClose";

const tree: PaneNode = makePaneLeaf("p1", [makeTerminal("t1", "Claude"), makeTerminal("t2", "Shell")]);
const treeRef: { current: PaneNode | null } = { current: tree };
const focusedRef: { current: string | null } = { current: "p1" };
const forward = vi.fn();
const applyTree = vi.fn();
const getPane = (id: string) => findPane(tree, id);

let root: Root;
let guarded: ReturnType<typeof useCloseGuardedTabs>;
let waits: ReturnType<typeof useCloseWhenDone>;

function Harness() {
  const [shared] = useState({ projectName: "web", treeRef, applyTree, forward });
  const tabs = useTabClose({ ...shared, focusedRef, getPane });
  waits = useCloseWhenDone({ ...shared, tree, ...tabs });
  guarded = useCloseGuardedTabs({ projectName: "web", treeRef, ...tabs, ...waits });
  return null;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  forward.mockClear();
  applyTree.mockClear();
  useCloseGuard.setState({ asking: null });
  useAppStore.setState({
    projects: [
      {
        name: "web",
        statusEntries: [{ key: "claude", value: STATUS_RUNNING, priority: 0, timestamp: Date.now(), paneID: "t1" }],
      },
    ],
  } as never);
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness />));
});

afterEach(() => act(() => root.unmount()));

// A detached window asks where the key was pressed; the window that owns the
// tabs does the closing.
describe("closing from a detached window", () => {
  it("asks here and closes there", () => {
    act(() => guarded.requestCloseTab("p1", 0));
    expect(forward).not.toHaveBeenCalled();
    act(() => answerClose((q) => q.closeNow));
    expect(forward).toHaveBeenLastCalledWith("closeTerminalById", "p1", "t1");

    act(() => guarded.requestCloseTab("p1", 0));
    act(() => answerClose((q) => q.closeWhenDone));
    expect(forward).toHaveBeenLastCalledWith("closeTabWhenDone", "t1");
    expect(applyTree).not.toHaveBeenCalled();
  });

  it("does the same for the other tabs and a pane", () => {
    act(() => guarded.requestCloseOthers("p1", 1));
    act(() => answerClose((q) => q.closeWhenDone));
    expect(forward).toHaveBeenLastCalledWith("closeOthersWhenDone", "p1", "t2");

    act(() => guarded.requestClosePane("p1"));
    act(() => answerClose((q) => q.closeWhenDone));
    expect(forward).toHaveBeenLastCalledWith("closePaneWhenDone", "p1");
    act(() => waits.keepOpen("t1"));
    expect(forward).toHaveBeenLastCalledWith("keepOpen", "t1");
    expect(applyTree).not.toHaveBeenCalled();
  });

  it("sends an idle tab's close straight on", () => {
    act(() => guarded.requestCloseTab("p1", 1));
    expect(useCloseGuard.getState().asking).toBeNull();
    expect(forward).toHaveBeenLastCalledWith("closeTerminalById", "p1", "t2");
  });
});
