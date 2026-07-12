import { describe, expect, it } from "vitest";
import {
  leaf,
  leaves,
  splitLeaf,
  closeLeaf,
  setLeafTerminal,
  pruneToTerminals,
} from "./remotePaneLayout";

describe("remotePaneLayout", () => {
  it("splits a leaf into two leaves", () => {
    const root = leaf("a");
    const next = splitLeaf(root, root.id, "row", "b");
    expect(next.kind).toBe("split");
    expect(leaves(next).map((l) => l.terminalId)).toEqual(["a", "b"]);
  });

  it("splits a nested leaf, leaving siblings intact", () => {
    let tree = leaf("a");
    tree = splitLeaf(tree, tree.id, "row", "b");
    const [la, lb] = leaves(tree);
    tree = splitLeaf(tree, lb.id, "col", "c");
    expect(leaves(tree).map((l) => l.terminalId)).toEqual(["a", "b", "c"]);
    // "a" untouched.
    expect(leaves(tree).some((l) => l.id === la.id)).toBe(true);
  });

  it("closing a leaf collapses its parent to the sibling", () => {
    let tree = leaf("a");
    tree = splitLeaf(tree, tree.id, "row", "b");
    const [, lb] = leaves(tree);
    tree = closeLeaf(tree, lb.id);
    expect(tree.kind).toBe("leaf");
    expect(leaves(tree).map((l) => l.terminalId)).toEqual(["a"]);
  });

  it("won't remove the last remaining leaf", () => {
    const root = leaf("a");
    expect(closeLeaf(root, root.id)).toBe(root);
  });

  it("assigns a terminal to a specific leaf", () => {
    let tree = leaf(null);
    tree = splitLeaf(tree, tree.id, "col", null);
    const [la] = leaves(tree);
    tree = setLeafTerminal(tree, la.id, "x");
    expect(leaves(tree).map((l) => l.terminalId)).toEqual(["x", null]);
  });

  it("prunes leaves whose terminal is gone, keeping one", () => {
    let tree = leaf("a");
    tree = splitLeaf(tree, tree.id, "row", "b");
    const pruned = pruneToTerminals(tree, new Set(["a"]));
    expect(leaves(pruned).map((l) => l.terminalId)).toEqual(["a"]);

    const allGone = pruneToTerminals(leaf("a"), new Set<string>());
    expect(leaves(allGone).map((l) => l.terminalId)).toEqual([null]);
  });
});
