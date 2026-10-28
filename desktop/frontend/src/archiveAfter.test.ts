import { describe, expect, it } from "vitest";
import { formatArchiveAfter, isArchiveAfter, parseArchiveAfter } from "./archiveAfter";

describe("archiveAfter", () => {
  it("reads the lengths and never that the Mac reads", () => {
    expect(parseArchiveAfter("90m")).toEqual({ amount: 90, unit: "m" });
    expect(parseArchiveAfter("1w")).toEqual({ amount: 1, unit: "w" });
    expect(parseArchiveAfter("never")).toBe("never");
    for (const bad of ["", "0d", "1000h", "2y", "d", "-1d", "1.5h", "01d"]) {
      expect(isArchiveAfter(bad)).toBe(false);
    }
  });

  it("writes a length back in the same form", () => {
    expect(formatArchiveAfter({ amount: 3, unit: "d" })).toBe("3d");
    expect(isArchiveAfter(formatArchiveAfter({ amount: 999, unit: "m" }))).toBe(true);
  });
});
