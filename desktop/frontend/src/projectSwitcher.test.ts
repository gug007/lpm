import { describe, expect, it } from "vitest";
import { buildSwitchList, cycleIndex } from "./projectSwitcher";

describe("buildSwitchList", () => {
  it("returns empty for no projects", () => {
    expect(buildSwitchList([], [], null)).toEqual([]);
  });

  it("returns the single project when only one exists", () => {
    expect(buildSwitchList([], ["a"], "a")).toEqual(["a"]);
  });

  it("puts current first, then MRU order, then remaining in list order", () => {
    expect(
      buildSwitchList(["b", "c"], ["a", "b", "c", "d"], "b"),
    ).toEqual(["b", "c", "a", "d"]);
  });

  it("puts current first even when current is not in MRU", () => {
    expect(buildSwitchList(["b"], ["a", "b", "c"], "a")).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("drops deleted projects that linger in MRU", () => {
    expect(
      buildSwitchList(["gone", "b"], ["a", "b", "c"], "a"),
    ).toEqual(["a", "b", "c"]);
  });

  it("handles a null current (no selection yet)", () => {
    expect(buildSwitchList(["c"], ["a", "b", "c"], null)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("dedupes without reordering", () => {
    expect(
      buildSwitchList(["a", "a", "b"], ["a", "b", "c"], "a"),
    ).toEqual(["a", "b", "c"]);
  });

  it("orders remaining projects by list order, not MRU recency", () => {
    expect(
      buildSwitchList(["d", "a"], ["a", "b", "c", "d"], "a"),
    ).toEqual(["a", "d", "b", "c"]);
  });
});

describe("cycleIndex", () => {
  it("advances forward", () => {
    expect(cycleIndex(4, 0, 1)).toBe(1);
    expect(cycleIndex(4, 2, 1)).toBe(3);
  });

  it("advances backward", () => {
    expect(cycleIndex(4, 2, -1)).toBe(1);
  });

  it("wraps forward past the end", () => {
    expect(cycleIndex(4, 3, 1)).toBe(0);
  });

  it("wraps backward past the start", () => {
    expect(cycleIndex(4, 0, -1)).toBe(3);
  });

  it("reverses direction mid-cycle", () => {
    const len = 3;
    let i = 0;
    i = cycleIndex(len, i, 1); // 1
    i = cycleIndex(len, i, 1); // 2
    i = cycleIndex(len, i, -1); // 1
    expect(i).toBe(1);
  });

  it("stays at 0 for a degenerate length", () => {
    expect(cycleIndex(0, 0, 1)).toBe(0);
    expect(cycleIndex(1, 0, 1)).toBe(0);
    expect(cycleIndex(1, 0, -1)).toBe(0);
  });
});
