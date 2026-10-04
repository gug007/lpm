import { describe, expect, it } from "vitest";
import { type ActionGroup, zoneGroup, zoneItemId } from "./actionsDndLayout";
import { zoneFrameState } from "./zoneFrameState";

const group = zoneGroup("ci");

describe("zone frame state", () => {
  it("is filled or empty when nothing is dragged", () => {
    expect(zoneFrameState({ ids: ["build"], activeId: null, overGroup: null, group })).toEqual({
      state: "filled",
      holdsButtons: true,
    });
    expect(zoneFrameState({ ids: [], activeId: null, overGroup: null, group })).toEqual({
      state: "empty",
      holdsButtons: false,
    });
  });

  it("marks a zone as a drop target while a button is dragged elsewhere", () => {
    const base = { ids: ["build"], activeId: "deploy", group };
    expect(zoneFrameState({ ...base, overGroup: null }).state).toBe("target");
    expect(zoneFrameState({ ...base, overGroup: "header" }).state).toBe("target");
    expect(zoneFrameState({ ...base, overGroup: zoneGroup("other") }).state).toBe("target");
  });

  it("marks the zone the dragged button is over", () => {
    expect(zoneFrameState({ ids: [], activeId: "deploy", overGroup: group, group })).toEqual({
      state: "over",
      holdsButtons: false,
    });
    expect(zoneFrameState({ ids: ["build"], activeId: "deploy", overGroup: group, group })).toEqual({
      state: "over",
      holdsButtons: true,
    });
  });

  it("does not count the dragged button's own slot, so the zone keeps its 150px minimum", () => {
    expect(zoneFrameState({ ids: ["build"], activeId: "build", overGroup: null, group })).toEqual({
      state: "target",
      holdsButtons: false,
    });
    expect(zoneFrameState({ ids: ["build"], activeId: "build", overGroup: group, group })).toEqual({
      state: "over",
      holdsButtons: false,
    });
  });

  it("still holds buttons when others sit beside the dragged one", () => {
    expect(zoneFrameState({ ids: ["build", "test"], activeId: "build", overGroup: null, group })).toEqual({
      state: "target",
      holdsButtons: true,
    });
  });

  it("leaves zones as they are while a zone is dragged", () => {
    const dragged = zoneItemId("other");
    expect(zoneFrameState({ ids: ["build"], activeId: dragged, overGroup: group, group })).toEqual({
      state: "filled",
      holdsButtons: true,
    });
    expect(zoneFrameState({ ids: [], activeId: dragged, overGroup: group, group })).toEqual({
      state: "empty",
      holdsButtons: false,
    });
    expect(zoneFrameState({ ids: [], activeId: dragged, overGroup: "header", group }).state).toBe("empty");
  });
});

describe("zoneFrameState across layers and lift-off", () => {
  it("stays the drop target while a hover on its dots opens another layer", () => {
    const state = (overGroup: ActionGroup) =>
      zoneFrameState({ ids: ["ios"], activeId: "lint", overGroup, group: "zone:tools/b" }).state;
    expect(state("zone:tools/a")).toBe("over");
    expect(state("zone:tools/b")).toBe("over");
    expect(state("zone:deploy")).toBe("target");
  });

  it("keeps a zone filled while its only button is lifted out of it", () => {
    const lifted = zoneFrameState({ ids: ["ios"], activeId: "ios", overGroup: null, group: "zone:tools", origin: "zone:tools" });
    expect(lifted.holdsButtons).toBe(true);
    const hovering = zoneFrameState({ ids: ["lint"], activeId: "lint", overGroup: "zone:tools", group: "zone:tools", origin: "header" });
    expect(hovering.holdsButtons).toBe(false);
  });
});
