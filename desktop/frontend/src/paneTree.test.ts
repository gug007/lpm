import { describe, it, expect } from "vitest";
import {
  ALL_SERVICES,
  adjacentPaneHeaderItem,
  paneHeaderItems,
  type PaneLeaf,
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
