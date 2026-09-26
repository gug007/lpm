import { describe, expect, it } from "vitest";
import {
  MAX_SIDE_BY_SIDE,
  addColumn,
  gridShape,
  removeColumn,
  sideBySideColumns,
} from "./sideBySide";

describe("sideBySideColumns", () => {
  const all = new Set(["a", "b", "c"]);

  it("shows the set while the selected project is in it", () => {
    expect(sideBySideColumns(["a", "b"], "b", all)).toEqual(["a", "b"]);
  });

  it("shows nothing once the user is in a project outside the set", () => {
    expect(sideBySideColumns(["a", "b"], "c", all)).toEqual([]);
  });

  it("drops projects that no longer exist, and a lone survivor is no set", () => {
    expect(sideBySideColumns(["a", "gone", "b"], "a", all)).toEqual(["a", "b"]);
    expect(sideBySideColumns(["a", "gone"], "a", all)).toEqual([]);
  });

  it("shows nothing with no selection", () => {
    expect(sideBySideColumns(["a", "b"], null, all)).toEqual([]);
  });
});

describe("addColumn", () => {
  it("starts a set from the anchor", () => {
    expect(addColumn([], "a", "b")).toEqual(["a", "b"]);
  });

  it("appends to the set the anchor is in", () => {
    expect(addColumn(["a", "b"], "b", "c")).toEqual(["a", "b", "c"]);
  });

  it("replaces a set the anchor isn't in", () => {
    expect(addColumn(["x", "y"], "a", "b")).toEqual(["a", "b"]);
  });

  it("keeps the set as is for a project already in it", () => {
    expect(addColumn(["a", "b"], "a", "b")).toEqual(["a", "b"]);
  });

  it("stops at the column limit", () => {
    const full = Array.from({ length: MAX_SIDE_BY_SIDE }, (_, i) => `p${i}`);
    expect(addColumn(full, "p0", "extra")).toEqual(full);
  });
});

describe("removeColumn", () => {
  it("drops the project", () => {
    expect(removeColumn(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("ends the set when one column would be left", () => {
    expect(removeColumn(["a", "b"], "a")).toEqual([]);
  });
});

describe("gridShape", () => {
  it("puts up to three in one row", () => {
    expect(gridShape(2)).toEqual({ cols: 2, rows: 1 });
    expect(gridShape(3)).toEqual({ cols: 3, rows: 1 });
  });

  it("wraps four or more into two rows", () => {
    expect(gridShape(4)).toEqual({ cols: 2, rows: 2 });
    expect(gridShape(5)).toEqual({ cols: 3, rows: 2 });
    expect(gridShape(6)).toEqual({ cols: 3, rows: 2 });
  });
});
