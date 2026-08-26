import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDEBAR_NAV,
  NAV_ITEM_IDS,
  isDefaultSidebarNav,
  isNavItemId,
  menuNavItems,
  normalizeSidebarNav,
  withSidebarNav,
} from "./sidebarNav";

describe("normalizeSidebarNav", () => {
  it("returns undefined for anything that is not a list", () => {
    expect(normalizeSidebarNav(undefined)).toBeUndefined();
    expect(normalizeSidebarNav(null)).toBeUndefined();
    expect(normalizeSidebarNav("terminals")).toBeUndefined();
    expect(normalizeSidebarNav({ 0: "terminals" })).toBeUndefined();
  });

  it("keeps an empty list, so an emptied sidebar is not read as untouched", () => {
    expect(normalizeSidebarNav([])).toEqual([]);
  });

  it("drops unknown ids, dedupes, and sorts into canonical order", () => {
    expect(normalizeSidebarNav(["stats", "nope", "terminals", "stats", 7])).toEqual([
      "terminals",
      "stats",
    ]);
  });
});

describe("withSidebarNav", () => {
  it("moves an item into the sidebar at its canonical position", () => {
    expect(withSidebarNav(["terminals", "stats"], "activity", true)).toEqual([
      "terminals",
      "activity",
      "stats",
    ]);
  });

  it("moves an item back into the menu", () => {
    expect(withSidebarNav(["terminals", "activity"], "terminals", false)).toEqual([
      "activity",
    ]);
  });

  it("is a no-op when the item is already where it is being moved", () => {
    expect(withSidebarNav(["terminals"], "terminals", true)).toEqual(["terminals"]);
    expect(withSidebarNav(["terminals"], "stats", false)).toEqual(["terminals"]);
  });

  it("round-trips back to the same order", () => {
    const start = [...DEFAULT_SIDEBAR_NAV];
    const out = withSidebarNav(withSidebarNav(start, "usage", true), "usage", false);
    expect(out).toEqual(start);
  });
});

describe("menuNavItems", () => {
  it("is everything the sidebar does not hold", () => {
    expect(menuNavItems(DEFAULT_SIDEBAR_NAV)).toEqual([
      "activity",
      "automations",
      "usage",
      "stats",
      "mobile",
      "settings",
      "feedback",
    ]);
    expect(menuNavItems(NAV_ITEM_IDS)).toEqual([]);
  });
});

describe("isDefaultSidebarNav", () => {
  it("recognizes the default and rejects any change to it", () => {
    expect(isDefaultSidebarNav(["terminals"])).toBe(true);
    expect(isDefaultSidebarNav([])).toBe(false);
    expect(isDefaultSidebarNav(["terminals", "stats"])).toBe(false);
    expect(isDefaultSidebarNav(["stats"])).toBe(false);
  });
});

describe("isNavItemId", () => {
  it("accepts every canonical id and nothing else", () => {
    for (const id of NAV_ITEM_IDS) expect(isNavItemId(id)).toBe(true);
    expect(isNavItemId("projects")).toBe(false);
    expect(isNavItemId(3)).toBe(false);
  });
});
