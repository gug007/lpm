import { describe, expect, it } from "vitest";
import YAML from "yaml";
import type { ActionInfo, ActionsLayout, ZoneInfo } from "./types";
import { applyActionUpdates, buildLayoutUpdates, patchLayoutDoc } from "./actionsLayoutUpdates";
import { zoneItemId } from "./components/actionsDndLayout";

const action = (name: string, display = "", layer?: string): ActionInfo =>
  ({ name, label: name, cmd: name, confirm: false, display, layer }) as ActionInfo;

describe("zone layers", () => {
  const store = [
    action("test"),
    action("ios", "build", "mobile"),
    action("deploy", "build", "web"),
    action("logs", "footer"),
  ];
  const zones: ZoneInfo[] = [
    { name: "build", label: "Build", rows: 2, source: "project", layers: [{ name: "web" }, { name: "mobile" }] },
  ];
  const base: ActionsLayout = {
    header: ["test", zoneItemId("build")],
    footer: ["logs"],
    zones: { "build/web": ["deploy"], "build/mobile": ["ios"] },
  };

  it("writes the zone and the layer for a button moved to another layer", () => {
    const after: ActionsLayout = { ...base, zones: { "build/web": ["deploy", "ios"], "build/mobile": [] } };
    expect(buildLayoutUpdates(store, after, base, zones).actions.get("ios")).toEqual({
      position: 2,
      display: "build",
      layer: "web",
      section: "actions",
    });
  });

  it("writes neither display nor layer for a move within a layer", () => {
    const withMore = [...store, action("lint", "build", "web")];
    const start: ActionsLayout = { ...base, zones: { "build/web": ["deploy", "lint"], "build/mobile": ["ios"] } };
    const after: ActionsLayout = { ...base, zones: { "build/web": ["lint", "deploy"], "build/mobile": ["ios"] } };
    const { actions } = buildLayoutUpdates(withMore, after, start, zones);
    expect(actions.get("deploy")).toEqual({ position: 2, section: "actions" });
    expect(actions.get("lint")).toEqual({ position: 1, section: "actions" });
  });

  it("clears the layer of a button moved out to the header", () => {
    const after: ActionsLayout = { ...base, header: ["test", "deploy", zoneItemId("build")], zones: { "build/web": [], "build/mobile": ["ios"] } };
    expect(buildLayoutUpdates(store, after, base, zones).actions.get("deploy")).toEqual({
      position: 2,
      display: "header",
      layer: null,
      section: "actions",
    });
  });

  it("clears the layer when the store has already previewed the move out", () => {
    const after: ActionsLayout = { ...base, header: ["test", "deploy", zoneItemId("build")], zones: { "build/web": [], "build/mobile": ["ios"] } };
    const previewed = applyActionUpdates(store, buildLayoutUpdates(store, after, base, zones).actions);
    expect(previewed.find((a) => a.name === "deploy")).not.toHaveProperty("layer");
    expect(buildLayoutUpdates(previewed, after, base, zones).actions.get("deploy")).toMatchObject({
      display: "header",
      layer: null,
    });
  });

  it("writes the layer for a header button moved into a layer", () => {
    const after: ActionsLayout = { ...base, header: [zoneItemId("build")], zones: { "build/web": ["deploy"], "build/mobile": ["ios", "test"] } };
    expect(buildLayoutUpdates(store, after, base, zones).actions.get("test")).toEqual({
      position: 2,
      display: "build",
      layer: "mobile",
      section: "actions",
    });
  });

  it("counts a button naming a missing layer as in the first layer", () => {
    const stale = [...store, action("lint", "build", "gone")];
    const after: ActionsLayout = { ...base, zones: { "build/web": ["lint", "deploy"], "build/mobile": ["ios"] } };
    expect(buildLayoutUpdates(stale, after, undefined, zones).actions.get("lint")).toEqual({
      position: 1,
      section: "actions",
    });
  });

  it("reads a button's layer from the store when no drag-start layout is given", () => {
    const after: ActionsLayout = { ...base, zones: { "build/web": ["deploy"], "build/mobile": ["ios"] } };
    const { actions } = buildLayoutUpdates(store, after, undefined, zones);
    expect(actions.get("ios")).toEqual({ position: 1, section: "actions" });
    expect(actions.get("deploy")).toEqual({ position: 1, section: "actions" });
  });

  it("sets and clears the layer in the store", () => {
    const into: ActionsLayout = { ...base, header: [zoneItemId("build")], zones: { "build/web": ["deploy", "test"], "build/mobile": ["ios"] } };
    const applied = applyActionUpdates(store, buildLayoutUpdates(store, into, base, zones).actions);
    expect(applied.find((a) => a.name === "test")).toMatchObject({ display: "build", layer: "web" });
    const out: ActionsLayout = { ...base, header: ["test", "ios", zoneItemId("build")], zones: { "build/web": ["deploy"], "build/mobile": [] } };
    const cleared = applyActionUpdates(store, buildLayoutUpdates(store, out, base, zones).actions);
    expect(cleared.find((a) => a.name === "ios")).not.toHaveProperty("layer");
    expect(cleared.find((a) => a.name === "ios")?.display).toBe("header");
  });

  describe("patchLayoutDoc", () => {
    const patch = (yaml: string, after: ActionsLayout) => {
      const doc = YAML.parseDocument(yaml);
      patchLayoutDoc(doc, buildLayoutUpdates(store, after, base, zones));
      return YAML.parse(String(doc));
    };
    const iosToWeb: ActionsLayout = { ...base, zones: { "build/web": ["deploy", "ios"], "build/mobile": [] } };
    const deployOut: ActionsLayout = { ...base, header: ["test", "deploy", zoneItemId("build")], zones: { "build/web": [], "build/mobile": ["ios"] } };

    it("sets the layer on an entry in the file", () => {
      const out = patch("actions:\n  ios:\n    cmd: make ios\n    display: build\n    layer: mobile\n", iosToWeb);
      expect(out.actions.ios).toEqual({ cmd: "make ios", display: "build", layer: "web", position: 2 });
    });

    it("deletes the layer of an entry moved out of the zone", () => {
      const out = patch("actions:\n  deploy:\n    cmd: make deploy\n    display: build\n    layer: web\n", deployOut);
      expect(out.actions.deploy).toEqual({ cmd: "make deploy", display: "header", position: 2 });
    });

    it("writes the layer into a sparse override", () => {
      expect(patch("root: /tmp\n", iosToWeb).actions.ios).toEqual({ position: 2, display: "build", layer: "web" });
    });

    it("writes no layer into a sparse override that clears it", () => {
      expect(patch("root: /tmp\n", deployOut).actions.deploy).toEqual({ position: 2, display: "header" });
    });

    it("writes the layer when it widens a shorthand entry", () => {
      const out = patch("actions:\n  ios: make ios\n", iosToWeb);
      expect(out.actions.ios).toEqual({ cmd: "make ios", position: 2, display: "build", layer: "web" });
    });
  });
});
