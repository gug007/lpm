import { describe, expect, it } from "vitest";
import { miniViewLines } from "./miniViewLines";
import { MAX_MINI_VIEWS, useMiniViews } from "./store/miniViews";

describe("miniViewLines", () => {
  it("shows a shell's last lines", () => {
    const screen = ["$ pnpm test", "", " ✓ auth.test.ts (3)", " ✓ utils.test.ts (3)", "", "", ""];
    expect(miniViewLines(screen, 3)).toEqual(["$ pnpm test", "", " ✓ auth.test.ts (3)", " ✓ utils.test.ts (3)"]);
    expect(miniViewLines(screen, 2)).toEqual([" ✓ auth.test.ts (3)", " ✓ utils.test.ts (3)"]);
  });

  it("leaves out Codex's input area and status line", () => {
    const screen = [
      "• Closing the leak will move your eval numbers.",
      "  Refit and score it?",
      "",
      "─".repeat(60),
      "",
      "› Ask Codex to do anything",
      "",
      "  gpt-6-astra max · Context 96% left",
    ];
    expect(miniViewLines(screen, 4)).toEqual(["• Closing the leak will move your eval numbers.", "  Refit and score it?"]);
  });

  it("leaves out Claude's boxed prompt", () => {
    const screen = [
      "⏺ Tests are green.",
      "",
      `╭${"─".repeat(40)}╮`,
      "│ >                                        │",
      `╰${"─".repeat(40)}╯`,
      "  ? for shortcuts",
    ];
    expect(miniViewLines(screen, 4)).toEqual(["⏺ Tests are green."]);
  });

  it("keeps one blank between paragraphs and none at the edges", () => {
    const screen = ["a", "", "", "b", "", "c", ""];
    expect(miniViewLines(screen, 5)).toEqual(["a", "", "b", "", "c"]);
  });

  it("keeps a rule far above the bottom as output", () => {
    const screen = ["─".repeat(30), ...Array.from({ length: 12 }, (_, i) => `line ${i}`)];
    expect(miniViewLines(screen, 2)).toEqual(["line 10", "line 11"]);
  });
});

describe("useMiniViews", () => {
  const view = (termId: string) => ({ termId, project: "app", label: termId });

  it("keeps at most two, pushing out the one kept longest", () => {
    useMiniViews.setState({ views: [] });
    const { toggle } = useMiniViews.getState();
    expect(toggle(view("a"))).toEqual({ kept: true, replaced: null });
    toggle(view("b"));
    expect(toggle(view("c"))).toEqual({ kept: true, replaced: expect.objectContaining(view("a")) });
    expect(useMiniViews.getState().views.map((v) => v.termId)).toEqual(["b", "c"]);
    expect(useMiniViews.getState().views).toHaveLength(MAX_MINI_VIEWS);
  });

  it("takes a kept tab out again, and drops one whose tab closed", () => {
    useMiniViews.setState({ views: [] });
    const { toggle, drop } = useMiniViews.getState();
    toggle(view("a"));
    toggle(view("b"));
    expect(toggle(view("a"))).toEqual({ kept: false, replaced: null });
    drop("b");
    expect(useMiniViews.getState().views).toEqual([]);
  });
});
