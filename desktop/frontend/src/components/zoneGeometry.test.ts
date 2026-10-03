import { describe, expect, it } from "vitest";
import {
  FOOTER_ROW_PX,
  zoneButtonHeight,
  zoneButtonSize,
  zoneEndSlot,
  zoneGridStyle,
  zoneHeight,
  zoneRowsLabel,
} from "./zoneGeometry";

describe("zone geometry", () => {
  it("spans whole header rows", () => {
    expect([zoneHeight(1), zoneHeight(2), zoneHeight(3)]).toEqual([32, 72, 112]);
  });

  it("leaves one 4px gap around and between buttons", () => {
    expect(zoneButtonHeight(1)).toBe(22);
    expect(zoneButtonHeight(2)).toBe(29);
    expect(zoneButtonHeight(3)).toBeCloseTo(31.33, 2);
  });

  it("spans whole footer rows: a footer button's height, 4px apart", () => {
    expect(FOOTER_ROW_PX).toBe(26.5);
    expect([zoneHeight(1, "footer"), zoneHeight(2, "footer"), zoneHeight(3, "footer")]).toEqual([26.5, 57, 87.5]);
  });

  it("shrinks footer zone buttons to keep the one 4px spacing", () => {
    expect(zoneButtonHeight(1, "footer")).toBe(16.5);
    expect(zoneButtonHeight(2, "footer")).toBe(21.5);
    expect(zoneButtonHeight(3, "footer")).toBeCloseTo(23.17, 2);
  });

  it("keeps the header grid as the default", () => {
    expect(zoneHeight(2)).toBe(zoneHeight(2, "header"));
    expect(zoneButtonHeight(3)).toBe(zoneButtonHeight(3, "header"));
  });

  it("draws footer zone buttons in the footer's style", () => {
    expect(zoneButtonSize("footer")).toBe("footerZone");
    expect(zoneButtonSize("header")).toBe("zone");
  });

  it("lays buttons out in columns of the zone's rows", () => {
    expect(zoneGridStyle(2, true)).toEqual({
      gridTemplateRows: "repeat(2, minmax(0, 1fr))",
      gap: 4,
      minWidth: undefined,
    });
    expect(zoneGridStyle(1, false).minWidth).toBe(150);
  });

  it("adds a button to an empty zone's first cell, a free cell, or a new column", () => {
    expect(zoneEndSlot(0, 2)).toBe("first");
    expect(zoneEndSlot(3, 2)).toBe("cell");
    expect(zoneEndSlot(2, 3)).toBe("cell");
    expect(zoneEndSlot(4, 2)).toBe("column");
    expect(zoneEndSlot(1, 1)).toBe("column");
    expect(zoneEndSlot(3, 1)).toBe("column");
  });

  it("names the heights", () => {
    expect([zoneRowsLabel(1), zoneRowsLabel(3)]).toEqual(["1 row", "3 rows"]);
  });
});
