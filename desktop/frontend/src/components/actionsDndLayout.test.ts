import { describe, expect, it } from "vitest";
import type { ActionsLayout, ZoneInfo } from "../types";
import { isChildId } from "../actionIds";
import {
  GROUP_DROP_PREFIX,
  applyMove,
  groupAcceptsDrag,
  groupDropId,
  groupOf,
  groupOfDropId,
  isGroupDropId,
  isZoneItemId,
  layoutWithoutZone,
  listOf,
  movedByZoneResize,
  resolveTarget,
  rowOfZone,
  sameLayout,
  zoneGroup,
  zoneItemId,
  zoneNameOfItem,
  zoneOfButton,
  zoneUnderPointer,
} from "./actionsDndLayout";

const layout = (): ActionsLayout => ({
  header: ["test", zoneItemId("build"), "lint"],
  footer: ["logs"],
  zones: { build: ["ios", "android"], agents: [] },
});

const withFooterZone = (): ActionsLayout => ({
  header: ["test", zoneItemId("build")],
  footer: ["logs", zoneItemId("ship"), "tail"],
  zones: { build: ["ios"], ship: ["prod", "beta"] },
});

describe("zone ids", () => {
  it("are never read as a menu path", () => {
    const id = zoneItemId("build");
    expect(isZoneItemId(id)).toBe(true);
    expect(isChildId(id)).toBe(false);
    expect(zoneNameOfItem(id)).toBe("build");
  });

  it("round-trip a group through its drop id", () => {
    const id = groupDropId(zoneGroup("build"));
    expect(isGroupDropId(id)).toBe(true);
    expect(groupOfDropId(id)).toBe("zone:build");
  });
});

describe("groupAcceptsDrag", () => {
  it("lets a dragged zone into the header and the footer, never into a zone", () => {
    const zone = zoneItemId("tools");
    expect(groupAcceptsDrag("header", zone)).toBe(true);
    expect(groupAcceptsDrag("footer", zone)).toBe(true);
    expect(groupAcceptsDrag(zoneGroup("build"), zone)).toBe(false);
  });

  it("lets a button into every group, and everything while nothing is dragged", () => {
    expect(groupAcceptsDrag(zoneGroup("build"), "lint")).toBe(true);
    expect(groupAcceptsDrag("footer", "lint")).toBe(true);
    expect(groupAcceptsDrag(zoneGroup("build"), null)).toBe(true);
  });
});

describe("listOf and groupOf", () => {
  it("find buttons inside zones", () => {
    expect(listOf(layout(), zoneGroup("build"))).toEqual(["ios", "android"]);
    expect(groupOf(layout(), "android")).toBe("zone:build");
    expect(groupOf(layout(), zoneItemId("build"))).toBe("header");
    expect(groupOf(layout(), "missing")).toBeNull();
  });
});

describe("zoneOfButton", () => {
  const zones: ZoneInfo[] = [
    { name: "build", label: "Build", rows: 2, source: "project" },
    { name: "agents", label: "Agents", rows: 1, source: "global" },
  ];

  it("finds the zone a button sits in", () => {
    expect(zoneOfButton(layout(), zones, "android")).toBe(zones[0]);
  });

  it("is undefined for buttons in the header or footer and for unknown ids", () => {
    expect(zoneOfButton(layout(), zones, "test")).toBeUndefined();
    expect(zoneOfButton(layout(), zones, "logs")).toBeUndefined();
    expect(zoneOfButton(layout(), zones, "missing")).toBeUndefined();
  });

  it("is undefined when the zone is no longer declared", () => {
    expect(zoneOfButton(layout(), [zones[1]], "ios")).toBeUndefined();
  });
});

describe("resolveTarget", () => {
  it("drops onto a zone's empty space at its end", () => {
    expect(resolveTarget(groupDropId(zoneGroup("build")), layout())).toEqual({
      group: "zone:build",
      index: 2,
    });
  });

  it("drops onto a button inside a zone at its index", () => {
    expect(resolveTarget("android", layout())).toEqual({ group: "zone:build", index: 1 });
  });

  it("ignores a zone that is not in the layout", () => {
    expect(resolveTarget(groupDropId(zoneGroup("gone")), layout())).toBeNull();
  });

  it("ignores a group drop id that names no group", () => {
    expect(resolveTarget(`${GROUP_DROP_PREFIX}bogus`, layout())).toBeNull();
  });

  it("ignores a zone named like an object property", () => {
    expect(resolveTarget(groupDropId(zoneGroup("toString")), layout())).toBeNull();
  });

  it("drops onto the header's empty space at its end", () => {
    expect(resolveTarget(groupDropId("header"), layout())).toEqual({ group: "header", index: 3 });
  });

  it("drops onto a header button at its index", () => {
    expect(resolveTarget("lint", layout())).toEqual({ group: "header", index: 2 });
  });
});

describe("applyMove", () => {
  it("moves a header button into a zone", () => {
    const next = applyMove(layout(), "lint", { group: zoneGroup("build"), index: 1 });
    expect(next.header).toEqual(["test", zoneItemId("build")]);
    expect(next.zones.build).toEqual(["ios", "lint", "android"]);
  });

  it("moves a zone button out to the footer", () => {
    const next = applyMove(layout(), "ios", { group: "footer", index: 0 });
    expect(next.zones.build).toEqual(["android"]);
    expect(next.footer).toEqual(["ios", "logs"]);
  });

  it("leaves its input untouched", () => {
    const before = layout();
    applyMove(before, "ios", { group: "footer", index: 0 });
    expect(before).toEqual(layout());
  });

  it("clamps an out-of-range index to the end of the target list", () => {
    const next = applyMove(layout(), "lint", { group: "footer", index: 99 });
    expect(next.footer).toEqual(["logs", "lint"]);
  });

  it("keeps the button in place when the target zone is not in the layout", () => {
    const next = applyMove(layout(), "lint", { group: zoneGroup("gone"), index: 0 });
    expect(next).toEqual(layout());
  });

  it("keeps the button in place when the target zone is named like an object property", () => {
    const next = applyMove(layout(), "lint", { group: zoneGroup("toString"), index: 0 });
    expect(next).toEqual(layout());
  });

  it("moves a zone from the header into the footer", () => {
    const next = applyMove(withFooterZone(), zoneItemId("build"), { group: "footer", index: 3 });
    expect(next.header).toEqual(["test"]);
    expect(next.footer).toEqual(["logs", zoneItemId("ship"), "tail", zoneItemId("build")]);
  });

  it("never puts a zone inside a zone", () => {
    const before = withFooterZone();
    expect(applyMove(before, zoneItemId("build"), { group: zoneGroup("ship"), index: 0 })).toBe(before);
  });
});

describe("rowOfZone", () => {
  it("finds the row a zone sits in", () => {
    expect(rowOfZone(withFooterZone(), "build")).toBe("header");
    expect(rowOfZone(withFooterZone(), "ship")).toBe("footer");
    expect(rowOfZone(withFooterZone(), "gone")).toBeNull();
  });
});

describe("sameLayout", () => {
  it("compares zone contents too", () => {
    const other = layout();
    other.zones.build = ["android", "ios"];
    expect(sameLayout(layout(), layout())).toBe(true);
    expect(sameLayout(layout(), other)).toBe(false);
  });

  it("is false when the zone names differ, even for an object property name", () => {
    const a: ActionsLayout = { header: [], footer: [], zones: { toString: [] } };
    const b: ActionsLayout = { header: [], footer: [], zones: { x: [] } };
    expect(sameLayout(a, b)).toBe(false);
  });
});

describe("layoutWithoutZone", () => {
  it("puts the zone's buttons where the zone was", () => {
    const next = layoutWithoutZone(layout(), "build");
    expect(next.header).toEqual(["test", "ios", "android", "lint"]);
    expect(next.zones).toEqual({ agents: [] });
  });

  it("puts a footer zone's buttons where it was in the footer", () => {
    const next = layoutWithoutZone(withFooterZone(), "ship");
    expect(next.footer).toEqual(["logs", "prod", "beta", "tail"]);
    expect(next.header).toEqual(["test", zoneItemId("build")]);
    expect(next.zones).toEqual({ build: ["ios"] });
  });

  it("ignores a zone named like an object property", () => {
    expect(layoutWithoutZone(withFooterZone(), "toString")).toEqual(withFooterZone());
  });
});

describe("zoneUnderPointer", () => {
  it("reads the zone from its frame", () => {
    expect(zoneUnderPointer(["ios", zoneItemId("build"), groupDropId("header")])).toBe("build");
    expect(zoneUnderPointer(["test", groupDropId("header")])).toBeNull();
  });

  it("never from a zone's drop area, whose rect can be stale after a preview", () => {
    expect(zoneUnderPointer([groupDropId(zoneGroup("agents")), "lint", groupDropId("header")])).toBeNull();
    expect(zoneUnderPointer([groupDropId(zoneGroup("agents")), zoneItemId("build")])).toBe("build");
  });
});

describe("movedByZoneResize", () => {
  it("lists every header item, then the drop area and buttons of each header zone", () => {
    expect(movedByZoneResize(layout(), "header")).toEqual([
      "test",
      zoneItemId("build"),
      "lint",
      groupDropId(zoneGroup("build")),
      "ios",
      "android",
    ]);
  });

  it("lists the footer's items and its zones for the footer", () => {
    expect(movedByZoneResize(withFooterZone(), "footer")).toEqual([
      "logs",
      zoneItemId("ship"),
      "tail",
      groupDropId(zoneGroup("ship")),
      "prod",
      "beta",
    ]);
  });
});
