import { describe, it, expect } from "vitest";
import {
  ALL_SERVICES,
  adjacentPaneHeaderItem,
  applyManualTerminalRename,
  clearManualTerminalTitle,
  findTerminalLocation,
  paneHeaderItems,
  terminalDisplayLabel,
  type PaneLeaf,
  type PaneNode,
  type PaneHeaderItem,
} from "./paneTree";

function leaf(tabCount: number, active: Partial<PaneLeaf> = {}): PaneLeaf {
  return {
    kind: "leaf",
    id: "pane",
    tabs: Array.from({ length: tabCount }, (_, i) => ({ id: `t${i}`, label: `t${i}` })),
    activeTabIdx: 0,
    ...active,
  };
}

function next(pane: PaneLeaf, services: string[], delta: 1 | -1): PaneHeaderItem | null {
  return adjacentPaneHeaderItem(pane, services, delta);
}

describe("paneHeaderItems", () => {
  it("lists services then tabs, with no All aggregate for a single service", () => {
    expect(paneHeaderItems(leaf(2), ["web"])).toEqual([
      { kind: "service", name: "web" },
      { kind: "tab", idx: 0 },
      { kind: "tab", idx: 1 },
    ]);
  });

  it("prepends the All aggregate when there is more than one service", () => {
    expect(paneHeaderItems(leaf(1), ["web", "api"])).toEqual([
      { kind: "service", name: ALL_SERVICES },
      { kind: "service", name: "web" },
      { kind: "service", name: "api" },
      { kind: "tab", idx: 0 },
    ]);
  });
});

describe("adjacentPaneHeaderItem", () => {
  it("returns null when fewer than two entries are selectable", () => {
    expect(next(leaf(1), [], 1)).toBeNull();
    expect(next(leaf(0), ["web"], 1)).toBeNull();
  });

  it("cycles forward and backward across tabs", () => {
    const pane = leaf(3, { activeTabIdx: 1 });
    expect(next(pane, [], 1)).toEqual({ kind: "tab", idx: 2 });
    expect(next(pane, [], -1)).toEqual({ kind: "tab", idx: 0 });
  });

  it("wraps around both ends", () => {
    expect(next(leaf(3, { activeTabIdx: 2 }), [], 1)).toEqual({ kind: "tab", idx: 0 });
    expect(next(leaf(3, { activeTabIdx: 0 }), [], -1)).toEqual({ kind: "tab", idx: 2 });
  });

  it("steps from a service into the first tab and back", () => {
    const pane = leaf(2, { activeServiceName: "web" });
    expect(next(pane, ["web"], 1)).toEqual({ kind: "tab", idx: 0 });
    expect(next(pane, ["web"], -1)).toEqual({ kind: "tab", idx: 1 });
  });

  it("moves from the first tab back into the last service", () => {
    const pane = leaf(2, { activeTabIdx: 0 });
    expect(next(pane, ["web", "api"], -1)).toEqual({ kind: "service", name: "api" });
  });

  it("navigates the All aggregate as the first entry", () => {
    const pane = leaf(1, { activeServiceName: ALL_SERVICES });
    expect(next(pane, ["web", "api"], 1)).toEqual({ kind: "service", name: "web" });
    expect(next(pane, ["web", "api"], -1)).toEqual({ kind: "tab", idx: 0 });
  });

  it("treats a stale active service name as the active tab", () => {
    const pane = leaf(2, { activeServiceName: "gone", activeTabIdx: 1 });
    expect(next(pane, ["web"], 1)).toEqual({ kind: "service", name: "web" });
    expect(next(pane, ["web"], -1)).toEqual({ kind: "tab", idx: 0 });
  });
});

describe("findTerminalLocation", () => {
  function pane(id: string, terminalIds: string[]): PaneLeaf {
    return {
      kind: "leaf",
      id,
      tabs: terminalIds.map((tid) => ({ id: tid, label: tid })),
      activeTabIdx: 0,
    };
  }

  const tree: PaneNode = {
    kind: "split",
    direction: "row",
    ratio: 0.5,
    a: pane("pane-1", ["a0"]),
    b: {
      kind: "split",
      direction: "col",
      ratio: 0.5,
      a: pane("pane-2", ["b0", "b1", "b2"]),
      b: pane("pane-3", ["c0"]),
    },
  };

  it("finds a terminal nested deep in the tree", () => {
    expect(findTerminalLocation(tree, "c0")).toEqual({ paneId: "pane-3", tabIdx: 0 });
  });

  it("reports the tab index within its pane", () => {
    expect(findTerminalLocation(tree, "b2")).toEqual({ paneId: "pane-2", tabIdx: 2 });
  });

  it("finds a terminal in a single-leaf tree", () => {
    expect(findTerminalLocation(pane("solo", ["x", "y"]), "y")).toEqual({
      paneId: "solo",
      tabIdx: 1,
    });
  });

  it("returns null when no pane holds the terminal", () => {
    expect(findTerminalLocation(tree, "missing")).toBeNull();
  });
});

describe("applyManualTerminalRename", () => {
  const titled = {
    id: "t0",
    label: "Codex",
    sessionTitle: "Fix terminal links",
    sessionTitleId: "session-1",
    sessionTitleSource: "vendor" as const,
  };

  it("keeps following the conversation when the prefilled title is resubmitted", () => {
    const same = applyManualTerminalRename(titled, "Fix terminal links");
    expect(same.sessionTitleSource).toBe("vendor");
    expect(same.sessionTitle).toBe("Fix terminal links");
    expect(same.label).toBe("Codex");
  });

  it("still applies an emoji-only edit without freezing the title", () => {
    const emojied = applyManualTerminalRename(titled, "Fix terminal links", "🚀");
    expect(emojied.emoji).toBe("🚀");
    expect(emojied.sessionTitleSource).toBe("vendor");
  });

  it("takes over the label for a real rename", () => {
    const renamed = applyManualTerminalRename(titled, "Mine");
    expect(renamed.label).toBe("Mine");
    expect(renamed.sessionTitle).toBeUndefined();
    expect(renamed.sessionTitleId).toBeUndefined();
    expect(renamed.sessionTitleSource).toBe("manual");
  });
});

describe("clearManualTerminalTitle", () => {
  it("re-enables conversation titles and keeps the label as the fallback", () => {
    const manual = clearManualTerminalTitle({
      id: "t0",
      label: "Mine",
      sessionTitleSource: "manual",
    });
    expect(manual.sessionTitleSource).toBeUndefined();
    expect(terminalDisplayLabel(manual)).toBe("Mine");
  });

  it("leaves a tab that never was renamed untouched", () => {
    const tab = { id: "t0", label: "Codex", sessionTitle: "Ship it" };
    expect(clearManualTerminalTitle(tab)).toBe(tab);
  });
});
