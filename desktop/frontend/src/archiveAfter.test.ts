import { describe, expect, it } from "vitest";
import {
  archiveAfterMillis,
  archiveAfterOf,
  describeArchiveAfter,
  formatArchiveAfter,
  isArchiveAfter,
  parseArchiveAfter,
} from "./archiveAfter";

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

  it("takes effect as the Mac reads it: unset or unreadable means an hour", () => {
    expect(archiveAfterOf(undefined)).toEqual({ amount: 1, unit: "h" });
    expect(archiveAfterOf("soon")).toEqual({ amount: 1, unit: "h" });
    expect(archiveAfterOf("never")).toBeNull();
    expect(archiveAfterMillis({ amount: 90, unit: "m" })).toBe(90 * 60_000);
    expect(archiveAfterMillis({ amount: 2, unit: "w" })).toBe(14 * 86_400_000);
  });

  it("names a length in words", () => {
    expect(describeArchiveAfter({ amount: 1, unit: "h" })).toBe("1 hour");
    expect(describeArchiveAfter({ amount: 90, unit: "m" })).toBe("90 minutes");
  });
});
