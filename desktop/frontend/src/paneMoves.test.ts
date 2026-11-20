import { describe, expect, it } from "vitest";
import { makePaneLeaf, makeTerminal, type PaneNode } from "./paneTree";
import { adjacentPaneId, canSplitOffTab, moveTabToNewPane } from "./paneMoves";

const t = (id: string) => makeTerminal(id, id);
const leaf = (id: string, ...tabs: string[]) => makePaneLeaf(id, tabs.map(t), 0);

// p1 on the left; p2 above p3 on the right.
const three: PaneNode = {
  kind: "split",
  direction: "row",
  ratio: 0.5,
  a: leaf("p1", "claude", "codex"),
  b: { kind: "split", direction: "col", ratio: 0.5, a: leaf("p2", "t1"), b: leaf("p3", "tests") },
};

function shape(node: PaneNode): unknown {
  if (node.kind === "leaf") return `${node.id}[${node.tabs.map((x) => x.id).join(",")}]`;
  return { [node.direction]: [shape(node.a), shape(node.b)] };
}

describe("adjacentPaneId", () => {
  it("steps in reading order and wraps", () => {
    expect(adjacentPaneId(three, "p1", 1)).toBe("p2");
    expect(adjacentPaneId(three, "p2", 1)).toBe("p3");
    expect(adjacentPaneId(three, "p3", 1)).toBe("p1");
    expect(adjacentPaneId(three, "p1", -1)).toBe("p3");
  });

  it("has nowhere to go with one pane", () => {
    expect(adjacentPaneId(leaf("p1", "a"), "p1", 1)).toBeNull();
  });
});

describe("canSplitOffTab", () => {
  it("needs something left behind", () => {
    expect(canSplitOffTab(leaf("p", "a"))).toBe(false);
    expect(canSplitOffTab({ ...leaf("p", "a"), activeServiceName: "web" })).toBe(true);
    expect(canSplitOffTab(leaf("p", "a", "b"))).toBe(true);
  });
});

describe("moveTabToNewPane", () => {
  it("splits a tab off below its own pane", () => {
    const next = moveTabToNewPane(three, "p1", "codex", "p1", "bottom", "n");
    expect(shape(next!)).toEqual({
      row: [{ col: ["p1[claude]", "n[codex]"] }, { col: ["p2[t1]", "p3[tests]"] }],
    });
  });

  it("puts a left drop before the target", () => {
    const next = moveTabToNewPane(three, "p1", "codex", "p2", "left", "n");
    expect(shape(next!)).toEqual({
      row: ["p1[claude]", { col: [{ row: ["n[codex]", "p2[t1]"] }, "p3[tests]"] }],
    });
  });

  it("closes the pane the move empties", () => {
    const next = moveTabToNewPane(three, "p3", "tests", "p1", "right", "n");
    expect(shape(next!)).toEqual({ row: [{ row: ["p1[claude,codex]", "n[tests]"] }, "p2[t1]"] });
  });

  it("keeps the active tab on screen in the pane it leaves", () => {
    const tree = makePaneLeaf("p", [t("a"), t("b"), t("c")], 2);
    const next = moveTabToNewPane(tree, "p", "c", "p", "right", "n");
    expect(next?.kind === "split" && next.a.kind === "leaf" && next.a.activeTabIdx).toBe(1);
  });

  it("does nothing for a pane's only tab dropped on itself", () => {
    expect(moveTabToNewPane(leaf("p", "a"), "p", "a", "p", "right", "n")).toBeNull();
  });

  it("lets a services pane give up its last tab", () => {
    const tree = { ...leaf("p", "a"), activeServiceName: "web" };
    const next = moveTabToNewPane(tree, "p", "a", "p", "bottom", "n");
    expect(shape(next!)).toEqual({ col: ["p[]", "n[a]"] });
  });
});
