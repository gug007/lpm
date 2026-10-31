import { describe, expect, it } from "vitest";
import { jumpTargets, reorderPins, shownPins, withPin } from "./pinnedProjects";

describe("shownPins", () => {
  it("keeps pinned order and drops pins with no project", () => {
    expect(shownPins(["api", "gone", "web"], new Set(["web", "api", "docs"]))).toEqual(["api", "web"]);
  });

  it("lists a name pinned twice once", () => {
    expect(shownPins(["web", "web"], new Set(["web"]))).toEqual(["web"]);
  });

  it("is empty when nothing is pinned", () => {
    expect(shownPins(undefined, new Set(["web"]))).toEqual([]);
  });
});

describe("withPin", () => {
  it("adds a pin at the end", () => {
    expect(withPin(["api"], "web", true)).toEqual(["api", "web"]);
  });

  it("moves an existing pin to the end rather than doubling it", () => {
    expect(withPin(["web", "api"], "web", true)).toEqual(["api", "web"]);
  });

  it("removes a pin and clears the setting when the last one goes", () => {
    expect(withPin(["web", "api"], "web", false)).toEqual(["api"]);
    expect(withPin(["web"], "web", false)).toBeUndefined();
  });
});

describe("reorderPins", () => {
  it("puts the dragged order first and keeps hidden pins after it", () => {
    expect(reorderPins(["web", "away", "api"], ["api", "web"])).toEqual(["api", "web", "away"]);
  });
});

describe("jumpTargets", () => {
  it("leads with the pinned projects, then the rest in sidebar order", () => {
    expect(jumpTargets(["docs", "api"], ["web", "api", "docs", "ml"])).toEqual(["docs", "api", "web", "ml"]);
  });

  it("is the sidebar order when nothing is pinned", () => {
    expect(jumpTargets([], ["web", "api"])).toEqual(["web", "api"]);
  });
});
