import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  startTerminal: vi.fn(),
  startForRestore: vi.fn(),
  terminalExists: vi.fn(),
}));

vi.mock(
  "../../../bridge/commands",
  () =>
    new Proxy(
      {},
      {
        has: () => true,
        get: (_t, prop) => {
          if (prop === "then") return undefined;
          if (prop === "StartTerminal") return h.startTerminal;
          if (prop === "StartTerminalForRestore") return h.startForRestore;
          if (prop === "TerminalExists") return h.terminalExists;
          return vi.fn();
        },
      },
    ),
);

import { reifyTreeWithFreshPtys, treeToPersisted } from "./persistedTree";
import { type PersistedPaneNode, type PersistedTab } from "../../terminals";
import {
  collectTerminals,
  terminalDisplayLabel,
  type PaneLeaf,
  type PaneNode,
} from "../../paneTree";

const leaf = (tabs: PersistedTab[], activeTabIdx = 0): PersistedPaneNode => ({
  kind: "leaf",
  tabs,
  activeTabIdx,
});

const asLeaf = (node: PaneNode | null): PaneLeaf => {
  if (!node || node.kind !== "leaf") throw new Error("expected a leaf pane");
  return node;
};

describe("reifyTreeWithFreshPtys", () => {
  beforeEach(() => {
    h.startTerminal.mockReset();
    h.startForRestore.mockReset();
    h.terminalExists.mockReset();
    h.terminalExists.mockResolvedValue(false);
  });

  // A peer pty lives on the other machine and outlives our restart. Relaunching
  // it would strand the running session (agent and all) behind an empty pane.
  it("adopts a peer terminal the host still has, instead of relaunching it", async () => {
    h.terminalExists.mockResolvedValue(true);
    const started: string[] = [];

    const pane = asLeaf(
      await reifyTreeWithFreshPtys(
        leaf([{ label: "Terminal 1", id: "peer-a1b2c3d4-project-7" }]),
        "peer-a1b2c3d4-demo",
        started,
      ),
    );

    expect(pane.tabs[0].id).toBe("peer-a1b2c3d4-project-7");
    expect(h.startTerminal).not.toHaveBeenCalled();
    expect(h.startForRestore).not.toHaveBeenCalled();
    // Never queued for teardown: a failed restore must not kill a live session
    // we merely adopted.
    expect(started).toEqual([]);
  });

  it("restores the memory session a tab was working under", async () => {
    h.startTerminal.mockResolvedValue("project-1");

    const pane = asLeaf(
      await reifyTreeWithFreshPtys(
        leaf([{ label: "Agent", memory: { session: "auth-refactor" } }]),
        "demo",
        [],
      ),
    );

    expect(pane.tabs[0].memory).toEqual({ session: "auth-refactor" });
  });

  // `startedIds` is how restore knows which panes to type the launch command
  // into: an adopted terminal is already running its program, so injecting there
  // would land in a live agent's prompt.
  it("keeps an adopted terminal's launch command but leaves it out of startedIds", async () => {
    h.terminalExists.mockResolvedValue(true);
    const started: string[] = [];

    const pane = asLeaf(
      await reifyTreeWithFreshPtys(
        leaf([{ label: "Terminal 1", id: "peer-a1b2c3d4-project-7", startCmd: "claude" }]),
        "peer-a1b2c3d4-demo",
        started,
      ),
    );

    expect(pane.tabs[0].startCmd).toBe("claude");
    expect(started).not.toContain("peer-a1b2c3d4-project-7");
  });

  it("relaunches a peer terminal the host has forgotten", async () => {
    h.terminalExists.mockResolvedValue(false);
    h.startTerminal.mockResolvedValue("pty-fresh");
    const started: string[] = [];

    const pane = asLeaf(
      await reifyTreeWithFreshPtys(
        leaf([{ label: "Terminal 1", id: "peer-a1b2c3d4-project-7" }]),
        "peer-a1b2c3d4-demo",
        started,
      ),
    );

    expect(pane.tabs[0].id).toBe("pty-fresh");
    expect(started).toEqual(["pty-fresh"]);
  });

  // Restore routinely runs before the peer connection is up. Answering that with
  // a fresh pty would leave the real terminal running on the host with nothing
  // attached — a stranded agent — so the check is retried instead.
  it("waits for the peer instead of relaunching, then adopts", async () => {
    vi.useFakeTimers();
    try {
      h.terminalExists
        .mockRejectedValueOnce(new Error("unknown peer"))
        .mockRejectedValueOnce(new Error("unknown peer"))
        .mockResolvedValue(true);

      const pending = reifyTreeWithFreshPtys(
        leaf([{ label: "Terminal 1", id: "peer-a1b2c3d4-project-7" }]),
        "peer-a1b2c3d4-demo",
        [],
      );
      await vi.advanceTimersByTimeAsync(2000);

      const pane = asLeaf(await pending);
      expect(pane.tabs[0].id).toBe("peer-a1b2c3d4-project-7");
      expect(h.startTerminal).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // Once the peer answers, a host that really lost the terminal still gets a
  // fresh one — retrying only covers "couldn't ask", not "isn't there".
  it("relaunches once the peer answers that the terminal is gone", async () => {
    vi.useFakeTimers();
    try {
      h.terminalExists.mockRejectedValueOnce(new Error("unknown peer")).mockResolvedValue(false);
      h.startTerminal.mockResolvedValue("pty-fresh");

      const pending = reifyTreeWithFreshPtys(
        leaf([{ label: "Terminal 1", id: "peer-a1b2c3d4-project-7" }]),
        "peer-a1b2c3d4-demo",
        [],
      );
      await vi.advanceTimersByTimeAsync(2000);

      const pane = asLeaf(await pending);
      expect(pane.tabs[0].id).toBe("pty-fresh");
    } finally {
      vi.useRealTimers();
    }
  });

  // A peer that never comes back must still not spawn a second terminal beside a
  // possibly-live one: adopt on faith and let the attach resubscribe if it's there.
  it("adopts rather than duplicating when the peer never answers", async () => {
    vi.useFakeTimers();
    try {
      h.terminalExists.mockRejectedValue(new Error("unknown peer"));

      const pending = reifyTreeWithFreshPtys(
        leaf([{ label: "Terminal 1", id: "peer-a1b2c3d4-project-7" }]),
        "peer-a1b2c3d4-demo",
        [],
      );
      await vi.advanceTimersByTimeAsync(10000);

      const pane = asLeaf(await pending);
      expect(pane.tabs[0].id).toBe("peer-a1b2c3d4-project-7");
      expect(h.startTerminal).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // A local id is always stale after a restart; only peer ids are adoptable.
  it("never adopts an unmarked local id", async () => {
    h.startTerminal.mockResolvedValue("pty-fresh");

    const pane = asLeaf(
      await reifyTreeWithFreshPtys(leaf([{ label: "Terminal 1", id: "project-7" }]), "demo", []),
    );

    expect(h.terminalExists).not.toHaveBeenCalled();
    expect(pane.tabs[0].id).toBe("pty-fresh");
  });

  it("keeps the tabs that started when one fails, and reports the loss", async () => {
    h.startForRestore.mockImplementation((_project: string, action: string) =>
      action === "gone"
        ? Promise.reject(new Error("no such action"))
        : Promise.resolve(`pty-${action}`),
    );
    const started: string[] = [];
    const dropped: PersistedTab[] = [];

    const tree = await reifyTreeWithFreshPtys(
      leaf([
        {
          label: "Claude",
          sessionTitle: "Fix terminal links",
          sessionTitleId: "abc",
          sessionTitleSource: "vendor",
          actionName: "claude",
          resumeCmd: "claude --resume abc",
        },
        {
          label: "Stale",
          actionName: "gone",
          resumeCmd: "claude --resume def",
        },
        { label: "Server", actionName: "server" },
      ]),
      "proj",
      started,
      dropped,
    );

    expect(asLeaf(tree).tabs.map((t) => t.label)).toEqual(["Claude", "Server"]);
    expect(asLeaf(tree).tabs[0]).toMatchObject({
      sessionTitle: "Fix terminal links",
      sessionTitleId: "abc",
      sessionTitleSource: "vendor",
    });
    expect(started).toEqual(["pty-claude", "pty-server"]);
    expect(dropped.map((t) => t.resumeCmd)).toEqual(["claude --resume def"]);
  });

  it("keeps the active tab selected when an earlier tab drops out", async () => {
    h.startForRestore.mockImplementation((_project: string, action: string) =>
      action === "gone"
        ? Promise.reject(new Error("boom"))
        : Promise.resolve(`pty-${action}`),
    );

    const tree = await reifyTreeWithFreshPtys(
      leaf(
        [
          { label: "Stale", actionName: "gone" },
          { label: "Claude", actionName: "claude" },
        ],
        1,
      ),
      "proj",
      [],
      [],
    );

    const pane = asLeaf(tree);
    expect(pane.tabs[pane.activeTabIdx].label).toBe("Claude");
  });

  it("collapses a split to the side that survived", async () => {
    h.startForRestore.mockImplementation((_project: string, action: string) =>
      action === "gone"
        ? Promise.reject(new Error("boom"))
        : Promise.resolve(`pty-${action}`),
    );

    const tree = await reifyTreeWithFreshPtys(
      {
        kind: "split",
        direction: "row",
        ratio: 0.5,
        a: leaf([{ label: "Stale", actionName: "gone" }]),
        b: leaf([{ label: "Claude", actionName: "claude" }]),
      },
      "proj",
      [],
      [],
    );

    expect(asLeaf(tree).tabs.map((t) => t.label)).toEqual(["Claude"]);
  });

  it("returns null only when nothing could be restored", async () => {
    h.startForRestore.mockRejectedValue(new Error("boom"));
    const dropped: PersistedTab[] = [];

    const tree = await reifyTreeWithFreshPtys(
      leaf([
        {
          label: "Claude",
          actionName: "gone",
          resumeCmd: "claude --resume abc",
        },
        {
          label: "Other",
          actionName: "gone-too",
          resumeCmd: "claude --resume def",
        },
      ]),
      "proj",
      [],
      dropped,
    );

    expect(tree).toBeNull();
    expect(dropped).toHaveLength(2);
  });

  it("keeps a service-only pane whose tabs all failed", async () => {
    h.startForRestore.mockRejectedValue(new Error("boom"));

    const tree = await reifyTreeWithFreshPtys(
      {
        kind: "leaf",
        tabs: [{ label: "Claude", actionName: "gone" }],
        activeTabIdx: 0,
        activeServiceName: "web",
      },
      "proj",
      [],
      [],
    );

    const pane = asLeaf(tree);
    expect(pane.tabs).toEqual([]);
    expect(pane.activeServiceName).toBe("web");
  });

  it("restores tabs without an action through the plain-shell path", async () => {
    h.startTerminal.mockResolvedValue("pty-1");

    const tree = await reifyTreeWithFreshPtys(
      leaf([{ label: "Terminal 1", startCmd: "npm run dev" }]),
      "proj",
      [],
      [],
    );

    expect(h.startTerminal).toHaveBeenCalledWith("proj");
    expect(asLeaf(tree).tabs[0].startCmd).toBe("npm run dev");
  });

  it("seeds manual labels before disambiguating earlier vendor titles", async () => {
    h.startForRestore.mockImplementation(
      (_project: string, action: string) =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve(`pty-${action}`),
            action === "vendor" ? 10 : 0,
          ),
        ),
    );

    const tree = await reifyTreeWithFreshPtys(
      {
        kind: "split",
        direction: "row",
        ratio: 0.5,
        a: leaf([
          {
            label: "Claude",
            sessionTitle: "Shared title",
            sessionTitleSource: "vendor",
            actionName: "vendor",
          },
        ]),
        b: leaf([
          {
            label: "Shared title",
            sessionTitle: "Stale vendor title",
            sessionTitleSource: "manual",
            actionName: "manual",
          },
        ]),
      },
      "proj",
      [],
      [],
    );

    expect(collectTerminals(tree!).map(terminalDisplayLabel)).toEqual([
      "Shared title 2",
      "Shared title",
    ]);
  });

  it("persists explicit session-title provenance", () => {
    const persisted = treeToPersisted({
      kind: "leaf",
      id: "pane",
      activeTabIdx: 0,
      tabs: [
        {
          id: "t1",
          label: "My tab",
          sessionTitleSource: "manual",
          resumeCmd: "claude --resume abc",
        },
      ],
    });
    expect(persisted.tabs?.[0]).toMatchObject({
      label: "My tab",
      sessionTitleSource: "manual",
    });
  });

  // The agent resumes into the same memory session after a restart, so the
  // marker has to survive with it or the brain goes dark on a live session.
  it("persists the memory session a tab is working under", () => {
    const persisted = treeToPersisted({
      kind: "leaf",
      id: "pane",
      activeTabIdx: 0,
      tabs: [
        { id: "t1", label: "Agent", memory: { session: "auth-refactor" } },
        { id: "t2", label: "Plain" },
      ],
    });
    expect(persisted.tabs?.[0].memory).toEqual({ session: "auth-refactor" });
    expect(persisted.tabs?.[1].memory).toBeUndefined();
  });

  // The id is the one thing that makes adoption possible, and it's only
  // meaningful for a pty on the other machine.
  it("keeps a peer terminal's id and drops a local one", () => {
    const persisted = treeToPersisted({
      kind: "leaf",
      id: "pane",
      activeTabIdx: 0,
      tabs: [
        { id: "peer-a1b2c3d4-project-7", label: "Remote" },
        { id: "project-7", label: "Local" },
      ],
    });
    expect(persisted.tabs?.[0].id).toBe("peer-a1b2c3d4-project-7");
    expect(persisted.tabs?.[1].id).toBeUndefined();
  });
});
