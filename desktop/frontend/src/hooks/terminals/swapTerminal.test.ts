import { describe, expect, it } from "vitest";
import { makePaneLeaf, makeTerminal, type PaneLeaf } from "../../paneTree";
import { swapTerminal } from "./swapTerminal";

describe("swapTerminal", () => {
  it("puts the new terminal in the old one's place and keeps what the tab is", () => {
    const old = makeTerminal("t-old", "Claude", {
      resumeCmd: "claude --resume abc",
      actionName: "claude",
      pinned: true,
      color: "blue",
      memory: { session: "auth-refactor" },
      forkOf: { label: "Main", at: 1 },
    });
    const other = makeTerminal("t-other", "Shell");
    const tree = makePaneLeaf("p1", [other, old], 1);

    const next = swapTerminal(tree, "p1", "t-old", "t-new") as PaneLeaf;

    expect(next.tabs.map((t) => t.id)).toEqual(["t-other", "t-new"]);
    expect(next.activeTabIdx).toBe(1);
    expect(next.tabs[1]).toMatchObject({
      label: "Claude",
      resumeCmd: "claude --resume abc",
      actionName: "claude",
      pinned: true,
      color: "blue",
      memory: { session: "auth-refactor" },
      forkOf: { label: "Main", at: 1 },
    });
    expect(next.tabs[0]).toBe(other);
  });
});
