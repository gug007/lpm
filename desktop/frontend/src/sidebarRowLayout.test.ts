import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROW_LAYOUT,
  MAX_ROW_LINES,
  addLine,
  normalizeRowLayout,
  presetLines,
  presetOf,
  removeLine,
  visibleLines,
} from "./sidebarRowLayout";

describe("normalizeRowLayout", () => {
  it("is the classic row when nothing is saved", () => {
    expect(normalizeRowLayout(undefined)).toEqual(DEFAULT_ROW_LAYOUT);
    expect(presetOf(normalizeRowLayout(undefined).lines)).toBe("today");
  });

  it("drops unknown details, repeats and lines past the fourth", () => {
    const layout = normalizeRowLayout({
      lines: [
        { left: ["alert", "nope", "pr"], right: ["pr", "origin"] },
        { left: ["alert", "branch"], right: [] },
        { left: [], right: [] },
        { left: [], right: [] },
        { left: ["version"], right: [] },
      ],
      changesSince: "branch",
      prStateWord: "yes",
    });
    expect(layout.lines).toHaveLength(MAX_ROW_LINES);
    expect(layout.lines[0]).toEqual({ left: ["alert", "pr"], right: ["origin"] });
    expect(layout.lines[1]).toEqual({ left: ["branch"], right: [] });
    expect(layout.changesSince).toBe("branch");
    expect(layout.prStateWord).toBe(false);
    expect(layout.hideDefaultBranch).toBe(true);
  });

  it("always keeps line 1", () => {
    expect(normalizeRowLayout({ lines: [] }).lines).toEqual([{ left: [], right: [] }]);
  });
});

describe("lines", () => {
  it("adds up to four lines and never removes line 1", () => {
    let lines = presetLines("today");
    lines = addLine(addLine(addLine(lines)));
    expect(lines).toHaveLength(4);
    expect(removeLine(lines, 0)).toHaveLength(4);
    expect(removeLine(lines, 1)[1]).toEqual({ left: [], right: [] });
  });

  it("shows line 1 always and a lower line only with something to say", () => {
    const lines = presetLines("three");
    const shown = visibleLines(lines, (d) => d === "pr" || d === "files");
    expect(shown).toEqual([
      { left: [], right: ["pr"] },
      { left: ["files"], right: [] },
    ]);
    expect(visibleLines(lines, () => false)).toEqual([{ left: [], right: [] }]);
  });
});
