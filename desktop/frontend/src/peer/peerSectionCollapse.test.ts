import { describe, it, expect } from "vitest";
import { parseCollapsedMap } from "./peerSectionCollapse";

describe("parseCollapsedMap", () => {
  it("returns an empty map for null or empty input", () => {
    expect(parseCollapsedMap(null)).toEqual({});
    expect(parseCollapsedMap("")).toEqual({});
  });

  it("returns an empty map for malformed JSON", () => {
    expect(parseCollapsedMap("{not json")).toEqual({});
  });

  it("ignores non-object JSON shapes", () => {
    expect(parseCollapsedMap("true")).toEqual({});
    expect(parseCollapsedMap("42")).toEqual({});
    expect(parseCollapsedMap('["a1b2c3d4"]')).toEqual({});
  });

  it("keeps only slugs explicitly set to true", () => {
    const raw = JSON.stringify({ a1b2c3d4: true, e5f60718: false, "9a8b7c6d": "yes" });
    expect(parseCollapsedMap(raw)).toEqual({ a1b2c3d4: true });
  });
});
