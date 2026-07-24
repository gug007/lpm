import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  startTerminal: vi.fn(),
  startForRestore: vi.fn(),
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
          return vi.fn();
        },
      },
    ),
);

import { reifyTreeWithFreshPtys } from "./persistedTree";
import { type PersistedPaneNode, type PersistedTab } from "../../terminals";
import { type PaneLeaf, type PaneNode } from "../../paneTree";

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
  });

  it("keeps the tabs that started when one fails, and reports the loss", async () => {
    h.startForRestore.mockImplementation((_project: string, action: string) =>
      action === "gone" ? Promise.reject(new Error("no such action")) : Promise.resolve(`pty-${action}`),
    );
    const started: string[] = [];
    const dropped: PersistedTab[] = [];

    const tree = await reifyTreeWithFreshPtys(
      leaf([
        { label: "Claude", actionName: "claude", resumeCmd: "claude --resume abc" },
        { label: "Stale", actionName: "gone", resumeCmd: "claude --resume def" },
        { label: "Server", actionName: "server" },
      ]),
      "proj",
      started,
      dropped,
    );

    expect(asLeaf(tree).tabs.map((t) => t.label)).toEqual(["Claude", "Server"]);
    expect(started).toEqual(["pty-claude", "pty-server"]);
    expect(dropped.map((t) => t.resumeCmd)).toEqual(["claude --resume def"]);
  });

  it("keeps the active tab selected when an earlier tab drops out", async () => {
    h.startForRestore.mockImplementation((_project: string, action: string) =>
      action === "gone" ? Promise.reject(new Error("boom")) : Promise.resolve(`pty-${action}`),
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
      action === "gone" ? Promise.reject(new Error("boom")) : Promise.resolve(`pty-${action}`),
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
        { label: "Claude", actionName: "gone", resumeCmd: "claude --resume abc" },
        { label: "Other", actionName: "gone-too", resumeCmd: "claude --resume def" },
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
      { kind: "leaf", tabs: [{ label: "Claude", actionName: "gone" }], activeTabIdx: 0, activeServiceName: "web" },
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
});
