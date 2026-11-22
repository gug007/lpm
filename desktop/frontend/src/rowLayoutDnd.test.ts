import { describe, expect, it } from "vitest";
import { TRAY_ZONE, dropIndex, itemsFromLines, linesFromItems, placeAt, sameItems, zoneId } from "./rowLayoutDnd";
import { presetLines } from "./sidebarRowLayout";

describe("row builder drag and drop", () => {
  const lines = presetLines("two");
  const items = itemsFromLines(lines);

  it("puts every hidden detail in the tray, in its own order", () => {
    expect(items[TRAY_ZONE]).toEqual(["ahead", "files", "ports", "version"]);
    expect(linesFromItems(items, lines.length)).toEqual(lines);
  });

  it("places a detail at an index among the others on a side", () => {
    const before = placeAt(items, "files", zoneId(1, "left"), 1);
    expect(before[zoneId(1, "left")]).toEqual(["status", "files", "branch", "changes"]);
    expect(before[TRAY_ZONE]).not.toContain("files");

    const atEnd = placeAt(items, "pr", zoneId(1, "right"), 99);
    expect(atEnd[zoneId(1, "right")]).toEqual(["commit", "pr"]);
    expect(atEnd[zoneId(0, "right")]).toEqual(["checks", "origin"]);
  });

  it("moves a detail along its own side without counting itself", () => {
    const next = placeAt(items, "origin", zoneId(0, "right"), 0);
    expect(next[zoneId(0, "right")]).toEqual(["origin", "pr", "checks"]);
    expect(sameItems(placeAt(items, "pr", zoneId(0, "right"), 0), items)).toBe(true);
  });

  it("takes a detail back to the tray in the tray's order", () => {
    const hidden = placeAt(items, "branch", TRAY_ZONE, 0);
    expect(hidden[TRAY_ZONE]).toEqual(["ahead", "branch", "files", "ports", "version"]);
    expect(hidden[zoneId(1, "left")]).toEqual(["status", "changes"]);
  });

  it("ignores a side that isn't there", () => {
    expect(placeAt(items, "pr", "L9-left", 0)).toBe(items);
  });

  it("lands a drop before the first detail whose middle is past the pointer", () => {
    const boxes = [
      { left: 0, width: 20 },
      { left: 30, width: 40 },
    ];
    expect(dropIndex(5, boxes)).toBe(0);
    expect(dropIndex(15, boxes)).toBe(1);
    expect(dropIndex(60, boxes)).toBe(2);
    expect(dropIndex(10, [])).toBe(0);
  });
});
