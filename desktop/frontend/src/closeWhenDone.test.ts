import { describe, expect, it } from "vitest";
import { closingGroups, markCloseWhenDone, markKeptOpen, settlePaneWaits } from "./closeWhenDone";
import { collectTerminals, makePaneLeaf, makeTerminal, mapPane, type PaneNode } from "./paneTree";

const tree: PaneNode = {
  kind: "split",
  direction: "row",
  ratio: 0.5,
  a: makePaneLeaf("p1", [makeTerminal("t1", "Claude"), makeTerminal("t2", "Shell")]),
  b: makePaneLeaf("p2", [makeTerminal("t3", "Codex")]),
};

const waits = (node: PaneNode) =>
  Object.fromEntries(collectTerminals(node).map((t) => [t.id, t.closeWhenDone ?? null]));

describe("closing once the agents are done", () => {
  it("marks tabs and takes it back, leaving the rest of the tree as it was", () => {
    const marked = markCloseWhenDone(tree, new Set(["t1", "t3"]), "tab");
    expect(waits(marked)).toEqual({ t1: "tab", t2: null, t3: "tab" });
    expect(markKeptOpen(markKeptOpen(marked, "t1"), "t3")).toEqual(tree);
    expect(markKeptOpen(tree, "t1")).toBe(tree);
    expect(markKeptOpen(tree, "gone")).toBe(tree);
  });

  it("keeps a whole pane open from any of its tabs, and only that pane", () => {
    const marked = markCloseWhenDone(tree, new Set(["t1", "t2"]), "pane");
    expect(waits(markKeptOpen(markCloseWhenDone(marked, new Set(["t3"]), "tab"), "t2"))).toEqual({
      t1: null,
      t2: null,
      t3: "tab",
    });
  });

  it("groups each tab alone and a pane's tabs together", () => {
    const marked = markCloseWhenDone(
      markCloseWhenDone(tree, new Set(["t1", "t2"]), "pane"),
      new Set(["t3"]),
      "tab",
    );
    expect(closingGroups(marked)).toEqual([
      { key: "pane:p1", ids: ["t1", "t2"], pane: true },
      { key: "t3", ids: ["t3"], pane: false },
    ]);
    expect(settlePaneWaits(marked, () => true)).toBe(marked);
    expect(closingGroups(tree)).toEqual([]);
    expect(closingGroups(null)).toEqual([]);
  });

  it("leaves a pinned tab alone", () => {
    const marked = markCloseWhenDone(tree, new Set(["t1"]), "tab");
    const pinned = mapPane(marked, "p1", (p) => ({
      ...p,
      tabs: p.tabs.map((t) => (t.id === "t1" ? { ...t, pinned: true } : t)),
    }));
    expect(closingGroups(pinned)).toEqual([]);
  });

  it("no longer closes a pane whole once a tab was opened in it, only its agents as they finish", () => {
    const marked = markCloseWhenDone(tree, new Set(["t1", "t2"]), "pane");
    const opened = mapPane(marked, "p1", (p) => ({ ...p, tabs: [...p.tabs, makeTerminal("t4", "New")] }));
    expect(closingGroups(opened)).toEqual([]);
    const settled = settlePaneWaits(opened, (id) => id === "t1");
    expect(waits(settled)).toEqual({ t1: "tab", t2: null, t4: null, t3: null });
  });
});
