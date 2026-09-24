// @vitest-environment happy-dom
import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistedPaneNode } from "../../terminals";

const h = vi.hoisted(() => ({
  stopTerminal: vi.fn((_id: string) => Promise.resolve()),
  reify: vi.fn(),
  saved: null as PersistedPaneNode | null,
}));

vi.mock("../../../bridge/commands", () => ({ StopTerminal: h.stopTerminal }));
vi.mock("../../mirror", () => ({
  IS_MIRROR_WINDOW: false,
  onMirrorTree: vi.fn(() => () => {}),
  requestMirrorTree: vi.fn(),
}));
vi.mock("../../terminals", () => ({
  getProjectTerminals: () => ({ panes: h.saved }),
  rememberLostSessions: vi.fn(() => Promise.resolve()),
  collectPersistedTabs: vi.fn(() => []),
}));
vi.mock("./persistedTree", () => ({
  reifyTreeWithFreshPtys: h.reify,
  legacyEntriesToTree: () => null,
}));

import { makePaneLeaf, makeTerminal, type PaneNode, type TerminalInstance } from "../../paneTree";
import { takeRelaunchNotice } from "../../peer/relaunchNotices";
import { useSessionRestore } from "./useSessionRestore";

const PEER_PROJECT = "peer-a1b2c3d4-demo";

// Stands in for reifyTreeWithFreshPtys: reports every tab as launched by this
// restore, and the listed ones as standing in for a terminal the host lost.
function restoresAs(tabs: TerminalInstance[], replaced: string[] = []) {
  h.reify.mockImplementation(
    async (
      _node: PersistedPaneNode,
      _project: string,
      startedIds: string[],
      _dropped: unknown[],
      _discarded: unknown[],
      replacedIds: string[],
    ): Promise<PaneNode> => {
      startedIds.push(...tabs.map((t) => t.id));
      replacedIds.push(...replaced);
      return makePaneLeaf("pane-1", tabs);
    },
  );
}

function Harness({ projectName }: { projectName: string }) {
  const [, setTree] = useState<PaneNode | null>(null);
  const [, setFocusedPaneId] = useState<string | null>(null);
  const treeRef = useRef<PaneNode | null>(null);
  const focusedRef = useRef<string | null>(null);
  const onCountRef = useRef<((count: number) => void) | undefined>(undefined);
  const restoreSettled = useRef<Promise<void>>(Promise.resolve());
  const scheduleCmdInject = useRef(vi.fn()).current;
  useSessionRestore({
    projectName,
    treeRef,
    focusedRef,
    onCountRef,
    restoreSettled,
    setTree,
    setFocusedPaneId,
    applyTree: vi.fn(),
    persist: vi.fn(),
    holdPersistedPanes: vi.fn(),
    scheduleCmdInject,
  });
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  h.stopTerminal.mockClear();
  h.reify.mockReset();
  h.saved = { kind: "leaf", activeTabIdx: 0, tabs: [{ label: "Terminal" }] };
});

afterEach(() => {
  container.remove();
});

async function mountAndRestore(projectName: string) {
  await act(async () => {
    root.render(<Harness projectName={projectName} />);
  });
}

describe("useSessionRestore cleanup", () => {
  it("stops the local terminals it launched when the project unmounts", async () => {
    restoresAs([makeTerminal("demo-1", "Terminal"), makeTerminal("demo-2", "Server")]);
    await mountAndRestore("demo");

    act(() => root.unmount());

    expect(h.stopTerminal.mock.calls.map(([id]) => id)).toEqual(["demo-1", "demo-2"]);
  });

  // The host keeps a peer terminal running while this project is off screen, the
  // same as every other peer terminal. Stopping it here killed agents on the host
  // whenever the view unmounted with the peer still connected.
  it("leaves the peer terminals it launched running on the host", async () => {
    restoresAs([makeTerminal("peer-a1b2c3d4-demo-4", "Agent")]);
    await mountAndRestore(PEER_PROJECT);

    act(() => root.unmount());

    expect(h.stopTerminal).not.toHaveBeenCalled();
  });

  // Nothing ever showed these, so nothing else will ever stop them.
  it("still stops peer terminals from a restore that lands after unmount", async () => {
    let finish!: () => void;
    const landed = new Promise<void>((resolve) => (finish = resolve));
    h.reify.mockImplementation(async (_n: unknown, _p: unknown, startedIds: string[]) => {
      startedIds.push("peer-a1b2c3d4-demo-4");
      await landed;
      return makePaneLeaf("pane-1", [makeTerminal("peer-a1b2c3d4-demo-4", "Agent")]);
    });
    await mountAndRestore(PEER_PROJECT);

    act(() => root.unmount());
    expect(h.stopTerminal).not.toHaveBeenCalled();
    await act(async () => finish());

    expect(h.stopTerminal).toHaveBeenCalledWith("peer-a1b2c3d4-demo-4");
  });
});

describe("useSessionRestore relaunch notices", () => {
  it("queues a notice for each tab that got a new terminal in place of a lost one", async () => {
    restoresAs(
      [
        makeTerminal("peer-a1b2c3d4-demo-7", "Agent", { resumeCmd: "claude --resume abc" }),
        makeTerminal("peer-a1b2c3d4-demo-8", "Shell"),
        makeTerminal("peer-a1b2c3d4-demo-9", "Untouched"),
      ],
      ["peer-a1b2c3d4-demo-7", "peer-a1b2c3d4-demo-8"],
    );
    await mountAndRestore(PEER_PROJECT);

    expect(takeRelaunchNotice("peer-a1b2c3d4-demo-7")).toMatch(/resuming it\]$/);
    expect(takeRelaunchNotice("peer-a1b2c3d4-demo-8")).toMatch(/this is a new shell\]$/);
    expect(takeRelaunchNotice("peer-a1b2c3d4-demo-9")).toBeUndefined();
    act(() => root.unmount());
  });

  // A notice left behind would greet some later terminal that happens to get the
  // same id.
  it("drops notices no pane took once the project unmounts", async () => {
    restoresAs([makeTerminal("peer-a1b2c3d4-demo-7", "Agent")], ["peer-a1b2c3d4-demo-7"]);
    await mountAndRestore(PEER_PROJECT);

    act(() => root.unmount());

    expect(takeRelaunchNotice("peer-a1b2c3d4-demo-7")).toBeUndefined();
  });
});
