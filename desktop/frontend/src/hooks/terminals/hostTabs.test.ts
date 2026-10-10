import { describe, it, expect } from "vitest";
import { withHostTabs } from "./hostTabs";
import { type PaneLeaf, type PaneNode, makePaneLeaf, makeTerminal } from "../../paneTree";

const leaf = (node: PaneNode) => node as PaneLeaf;

describe("withHostTabs", () => {
  it("opens an empty project on the host's tabs", () => {
    const { tree, focus } = withHostTabs(null, null, [
      { id: "peer-aaaaaaaa-lpm-1", label: "Claude Code", pinned: false },
      { id: "peer-aaaaaaaa-lpm-2", pinned: true },
    ]);
    const pane = leaf(tree);
    expect(focus).toBe(pane.id);
    expect(pane.activeTabIdx).toBe(0);
    expect(pane.tabs.map((t) => [t.id, t.label, !!t.pinned])).toEqual([
      ["peer-aaaaaaaa-lpm-1", "Claude Code", false],
      ["peer-aaaaaaaa-lpm-2", "Terminal 1", true],
    ]);
  });

  it("adds behind the tab in view of the focused pane", () => {
    const left = makePaneLeaf("left", [makeTerminal("a", "Claude Code")]);
    const right = makePaneLeaf("right", [makeTerminal("b", "Terminal 1")]);
    const start: PaneNode = { kind: "split", direction: "row", ratio: 0.5, a: left, b: right };
    const { tree, focus } = withHostTabs(start, "right", [
      { id: "peer-aaaaaaaa-lpm-3", label: "Claude Code", pinned: false },
      { id: "peer-aaaaaaaa-lpm-4", pinned: false },
    ]);
    expect(focus).toBeUndefined();
    const split = tree as Extract<PaneNode, { kind: "split" }>;
    expect(split.a).toBe(left);
    const pane = leaf(split.b);
    expect(pane.activeTabIdx).toBe(0);
    expect(pane.tabs.map((t) => t.label)).toEqual(["Terminal 1", "Claude Code 2", "Terminal 2"]);
  });

  it("falls back to the first pane when focus points nowhere", () => {
    const only = makePaneLeaf("only", [makeTerminal("a", "Terminal 1")]);
    const { tree } = withHostTabs(only, "gone", [{ id: "peer-aaaaaaaa-lpm-5", pinned: false }]);
    expect(leaf(tree).tabs.map((t) => t.id)).toEqual(["a", "peer-aaaaaaaa-lpm-5"]);
  });
});
