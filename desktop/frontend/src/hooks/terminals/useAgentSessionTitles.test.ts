// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { RefObject } from "react";
import {
  makePaneLeaf,
  makeTerminal,
  type PaneNode,
} from "../../paneTree";

const commandMocks = vi.hoisted(() => ({
  AgentSessionTitle: vi.fn(),
}));

vi.mock("../../mirror", () => ({ IS_MIRROR_WINDOW: false }));
vi.mock("../../../bridge/commands", () => ({
  AgentSessionTitle: commandMocks.AgentSessionTitle,
}));

import {
  sessionTitlePollKey,
  useAgentSessionTitles,
} from "./useAgentSessionTitles";

interface HarnessProps {
  tree: PaneNode | null;
  treeRef: RefObject<PaneNode | null>;
  applyTree: (next: PaneNode | null) => void;
  enabled?: boolean;
  projectName?: string;
}

function Harness({
  tree,
  treeRef,
  applyTree,
  enabled,
  projectName = "project",
}: HarnessProps) {
  useAgentSessionTitles({
    projectName,
    tree,
    treeRef,
    applyTree,
    enabled,
  });
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  commandMocks.AgentSessionTitle.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
});

async function renderHarness(props: HarnessProps) {
  await act(async () => {
    root.render(createElement(Harness, props));
    await Promise.resolve();
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function claudeTree(sessionId = "session-1") {
  return makePaneLeaf("pane", [
    makeTerminal("term-1", "Claude", {
      agentSession: { provider: "claude", sessionId },
    }),
  ]);
}

describe("sessionTitlePollKey", () => {
  it("tracks live session changes and manual overrides, not fetched titles", () => {
    const first = claudeTree();
    const withTitle = makePaneLeaf("pane", [
      {
        ...first.tabs[0],
        sessionTitle: "Conversation",
        sessionTitleId: "session-1",
        sessionTitleSource: "vendor",
      },
    ]);
    const manual = makePaneLeaf("pane", [
      { ...withTitle.tabs[0], sessionTitleSource: "manual" },
    ]);

    expect(sessionTitlePollKey(withTitle)).toBe(sessionTitlePollKey(first));
    expect(sessionTitlePollKey(manual)).not.toBe(sessionTitlePollKey(first));
  });
});

describe("useAgentSessionTitles", () => {
  it("does no lookup or polling while disabled", async () => {
    const tree = claudeTree();
    const treeRef = { current: tree };

    await renderHarness({
      tree,
      treeRef,
      applyTree: vi.fn(),
      enabled: false,
    });
    await vi.advanceTimersByTimeAsync(60000);

    expect(commandMocks.AgentSessionTitle).not.toHaveBeenCalled();
  });

  it("does not schedule work without a session or for a manual title", async () => {
    const plain = makePaneLeaf("pane", [makeTerminal("term-1", "Terminal")]);
    const manual = makePaneLeaf("pane", [
      makeTerminal("term-2", "Mine", {
        agentSession: { provider: "claude", sessionId: "session-2" },
        sessionTitleSource: "manual",
      }),
    ]);
    const tree = {
      kind: "split" as const,
      direction: "row" as const,
      ratio: 0.5,
      a: plain,
      b: manual,
    };

    await renderHarness({
      tree,
      treeRef: { current: tree },
      applyTree: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(60000);

    expect(commandMocks.AgentSessionTitle).not.toHaveBeenCalled();
  });

  it("retries pending metadata quickly, then applies a vendor title", async () => {
    commandMocks.AgentSessionTitle
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(" Fix terminal links ");
    const tree = claudeTree();
    const treeRef: RefObject<PaneNode | null> = { current: tree };
    const applyTree = vi.fn((next: PaneNode | null) => {
      treeRef.current = next;
    });

    await renderHarness({ tree, treeRef, applyTree });
    expect(commandMocks.AgentSessionTitle).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(commandMocks.AgentSessionTitle).toHaveBeenCalledTimes(2);
    expect(applyTree).toHaveBeenCalledTimes(1);
    const tab =
      treeRef.current?.kind === "leaf" ? treeRef.current.tabs[0] : null;
    expect(tab?.sessionTitle).toBe("Fix terminal links");
    expect(tab?.sessionTitleId).toBe("session-1");
    expect(tab?.sessionTitleSource).toBe("vendor");
  });

  it("does not re-derive a restored title on mount", async () => {
    commandMocks.AgentSessionTitle.mockResolvedValue("Conversation");
    const restored = makePaneLeaf("pane", [
      makeTerminal("term-1", "Claude", {
        agentSession: { provider: "claude", sessionId: "session-1" },
        sessionTitle: "Conversation",
        sessionTitleId: "session-1",
        sessionTitleSource: "vendor",
      }),
    ]);

    await renderHarness({
      tree: restored,
      treeRef: { current: restored },
      applyTree: vi.fn(),
    });
    expect(commandMocks.AgentSessionTitle).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(15000);
    expect(commandMocks.AgentSessionTitle).toHaveBeenCalledTimes(1);
  });

  it("backs off while no title is published", async () => {
    commandMocks.AgentSessionTitle.mockResolvedValue(null);
    const tree = claudeTree();

    await renderHarness({
      tree,
      treeRef: { current: tree },
      applyTree: vi.fn(),
    });
    expect(commandMocks.AgentSessionTitle).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(commandMocks.AgentSessionTitle).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(4999);
    expect(commandMocks.AgentSessionTitle).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(commandMocks.AgentSessionTitle).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(14999);
    expect(commandMocks.AgentSessionTitle).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(commandMocks.AgentSessionTitle).toHaveBeenCalledTimes(4);
  });

  it("returns to the fast cadence once a title lands", async () => {
    commandMocks.AgentSessionTitle.mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue("Conversation");
    const tree = claudeTree();
    const treeRef: RefObject<PaneNode | null> = { current: tree };
    const applyTree = (next: PaneNode | null) => {
      treeRef.current = next;
    };

    await renderHarness({ tree, treeRef, applyTree });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(commandMocks.AgentSessionTitle).toHaveBeenCalledTimes(3);

    // The title landed on the third poll, so the next pending stretch starts
    // from the fast cadence again instead of the decayed one.
    const titled =
      treeRef.current?.kind === "leaf" ? treeRef.current.tabs[0] : null;
    expect(titled?.sessionTitle).toBe("Conversation");

    await vi.advanceTimersByTimeAsync(15000);
    expect(commandMocks.AgentSessionTitle).toHaveBeenCalledTimes(4);
  });

  it("uses the slower refresh cadence after a title resolves", async () => {
    commandMocks.AgentSessionTitle.mockResolvedValue("Conversation");
    const tree = claudeTree();
    const treeRef: RefObject<PaneNode | null> = { current: tree };
    const applyTree = (next: PaneNode | null) => {
      treeRef.current = next;
    };

    await renderHarness({ tree, treeRef, applyTree });
    expect(commandMocks.AgentSessionTitle).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(14999);
    expect(commandMocks.AgentSessionTitle).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(commandMocks.AgentSessionTitle).toHaveBeenCalledTimes(2);
  });

  it("stops retrying a repeatedly failing unsupported lookup", async () => {
    commandMocks.AgentSessionTitle.mockRejectedValue(
      new Error("agent session titles are unsupported"),
    );
    const tree = claudeTree();

    await renderHarness({
      tree,
      treeRef: { current: tree },
      applyTree: vi.fn(),
    });
    expect(commandMocks.AgentSessionTitle).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(commandMocks.AgentSessionTitle).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(60000);
    expect(commandMocks.AgentSessionTitle).toHaveBeenCalledTimes(3);
  });

  it("does not let an old session lookup overwrite a replacement session", async () => {
    let resolveOld!: (title: string) => void;
    commandMocks.AgentSessionTitle
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce("New conversation");
    const oldTree = claudeTree("old-session");
    const treeRef: RefObject<PaneNode | null> = { current: oldTree };
    const applyTree = vi.fn((next: PaneNode | null) => {
      treeRef.current = next;
    });

    await renderHarness({ tree: oldTree, treeRef, applyTree });
    const newTree = claudeTree("new-session");
    treeRef.current = newTree;
    await renderHarness({ tree: newTree, treeRef, applyTree });
    await flush();

    resolveOld("Old conversation");
    await flush();

    const tab =
      treeRef.current?.kind === "leaf" ? treeRef.current.tabs[0] : null;
    expect(tab?.agentSession?.sessionId).toBe("new-session");
    expect(tab?.sessionTitle).toBe("New conversation");
    expect(tab?.sessionTitleId).toBe("new-session");
  });
});
