import { describe, expect, it } from "vitest";
import { openListKey } from "../../store/zoneLayers";
import type { ZoneInfo } from "../../types";
import { showMoveTarget, zoneTargetsFor } from "./actionMenuZones";

const zones: ZoneInfo[] = [
  { name: "build", label: "Build", rows: 2, source: "project", layers: [{ name: "mobile", label: "Mobile" }, { name: "web", label: "Web" }] },
  { name: "db", label: "Database", rows: 1, display: "footer", source: "project" },
];

describe("zoneTargetsFor", () => {
  it("offers every zone and layer but the one the button is in, each with its row", () => {
    expect(zoneTargetsFor(zones, "zone:build/mobile")).toEqual([
      { group: "zone:build/web", label: "Build › Web", row: "header" },
      { group: "zone:db", label: "Database", row: "footer" },
    ]);
  });

  it("offers them all for a button in the header", () => {
    expect(zoneTargetsFor(zones, "header").map((target) => target.group)).toEqual([
      "zone:build/mobile",
      "zone:build/web",
      "zone:db",
    ]);
  });
});

describe("showMoveTarget", () => {
  it("opens the layer a button moved into", () => {
    showMoveTarget("shop", "zone:build/web");
    expect(openListKey("shop", zones[0])).toBe("build/web");
  });

  it("leaves the open layer alone for a row or a zone without layers", () => {
    showMoveTarget("cafe", "footer");
    showMoveTarget("cafe", "zone:db");
    expect(openListKey("cafe", zones[0])).toBe("build/mobile");
  });
});
