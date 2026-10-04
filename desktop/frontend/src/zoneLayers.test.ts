import { describe, expect, it } from "vitest";
import {
  hasPager,
  layerKeyFor,
  layerOfListKey,
  layoutHasZone,
  listKeyForAction,
  listKeysInLayout,
  listKeysOfZone,
  zoneListKey,
  zoneOfListKey,
  zonePlacements,
} from "./zoneLayers";
import type { ZoneInfo } from "./types";

const plain = { name: "build", layers: undefined };
const layered = { name: "build", layers: [{ name: "mobile", label: "Mobile" }, { name: "web" }] };

describe("zone list keys", () => {
  it("is the zone name without a layer and zone/layer with one", () => {
    expect(zoneListKey("build")).toBe("build");
    expect(zoneListKey("build", "web")).toBe("build/web");
    expect(zoneOfListKey("build/web")).toBe("build");
    expect(zoneOfListKey("build")).toBe("build");
    expect(layerOfListKey("build/web")).toBe("web");
    expect(layerOfListKey("build")).toBeNull();
  });

  it("lists one key for a plain zone and one per layer otherwise", () => {
    expect(listKeysOfZone(plain)).toEqual(["build"]);
    expect(listKeysOfZone(layered)).toEqual(["build/mobile", "build/web"]);
  });

  it("puts a button with no or a missing layer into the first layer", () => {
    expect(listKeyForAction(layered, undefined)).toBe("build/mobile");
    expect(listKeyForAction(layered, "gone")).toBe("build/mobile");
    expect(listKeyForAction(layered, "web")).toBe("build/web");
    expect(listKeyForAction(plain, "web")).toBe("build");
  });

  it("shows dots only with two or more layers", () => {
    expect(hasPager(plain)).toBe(false);
    expect(hasPager({ layers: [{ name: "a" }] })).toBe(false);
    expect(hasPager(layered)).toBe(true);
  });

  it("finds a zone's lists in a layout", () => {
    const layout = { header: [], footer: [], zones: { "build/mobile": ["ios"], "build/web": [], deploy: [] } };
    expect(listKeysInLayout(layout, "build")).toEqual(["build/mobile", "build/web"]);
    expect(listKeysInLayout(layout, "deploy")).toEqual(["deploy"]);
    expect(layoutHasZone(layout, "build")).toBe(true);
    expect(layoutHasZone(layout, "bui")).toBe(false);
  });

  it("keys a layer from its name, or layer-<n> without one", () => {
    expect(layerKeyFor("Mobile Apps", [])).toBe("mobile-apps");
    expect(layerKeyFor("Mobile", ["mobile"])).toBe("mobile-2");
    expect(layerKeyFor("", ["layer-1"])).toBe("layer-2");
    expect(layerKeyFor("  ", ["layer-1", "layer-2"])).toBe("layer-3");
  });
});

describe("zonePlacements", () => {
  it("names a zone, and each layer of a zone with layers, the way menus show them", () => {
    const zones: ZoneInfo[] = [
      { name: "build", label: "Build", rows: 1, source: "project", layers: [{ name: "mobile", label: "Mobile" }, { name: "web" }] },
      { name: "db", label: "Database", rows: 1, source: "project" },
    ];
    expect(zonePlacements(zones).map(({ listKey, label }) => [listKey, label])).toEqual([
      ["build/mobile", "Build › Mobile"],
      ["build/web", "Build › Layer 2"],
      ["db", "Database"],
    ]);
  });
});
