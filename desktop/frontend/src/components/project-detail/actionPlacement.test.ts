import { describe, expect, it } from "vitest";
import type { ActionPatch } from "../../actionConfig";
import type { ZoneInfo } from "../../types";
import {
  placementFromYaml,
  placementOf,
  placementPatch,
  withDeclaredDisplay,
  withoutPlacement,
  yamlPlacement,
} from "./actionPlacement";

const zone = (name: string, layers?: string[]): ZoneInfo => ({
  name,
  label: name,
  rows: 2,
  source: "project",
  layers: layers?.map((layer) => ({ name: layer })),
});

const plainZones = [zone("build"), zone("ship")];
const layeredZones = [zone("build", ["web", "mobile"]), zone("ship")];

describe("placementOf", () => {
  it("reads footer, a known zone, or header", () => {
    expect(placementOf("footer", undefined, plainZones)).toBe("footer");
    expect(placementOf("build", undefined, plainZones)).toBe("build");
    expect(placementOf("", undefined, plainZones)).toBe("header");
    expect(placementOf("gone", undefined, plainZones)).toBe("header");
  });

  it("reads the layer of a layered zone", () => {
    expect(placementOf("build", "mobile", layeredZones)).toBe("build/mobile");
  });

  it.each([
    ["no layer", undefined],
    ["a missing layer", "gone"],
  ])("reads %s as the zone's first layer", (_, layer) => {
    expect(placementOf("build", layer, layeredZones)).toBe("build/web");
  });

  it("ignores a layer on a zone without layers", () => {
    expect(placementOf("ship", "mobile", layeredZones)).toBe("ship");
  });

  it("ignores a layer outside a zone", () => {
    expect(placementOf("footer", "mobile", layeredZones)).toBe("footer");
    expect(placementOf("", "mobile", layeredZones)).toBe("header");
  });
});

describe("placementPatch", () => {
  it("writes nothing while placement is untouched", () => {
    expect(placementPatch("build", false)).toEqual({});
  });

  it("writes nothing for an untouched layer either", () => {
    expect(placementPatch("build/mobile", false)).toEqual({});
  });

  it("writes a touched placement out, header included, so a lower file's display can't show through", () => {
    expect(placementPatch("header", true)).toEqual({ set: "header", layer: null });
    expect(placementPatch("footer", true)).toEqual({ set: "footer", layer: null });
    expect(placementPatch("build", true)).toEqual({ set: "build", layer: null });
  });

  it("splits a touched layer into the zone and its layer", () => {
    expect(placementPatch("build/mobile", true)).toEqual({ set: "build", layer: "mobile" });
  });
});

describe("withoutPlacement", () => {
  it("drops display from set and remove and keeps every other field", () => {
    const patch: ActionPatch = {
      set: { label: "Build", cmd: "make", display: "build" },
      remove: ["emoji", "display", "shortcut"],
    };
    expect(withoutPlacement(patch)).toEqual({
      set: { label: "Build", cmd: "make" },
      remove: ["emoji", "shortcut"],
    });
  });

  it("drops a display that is only being removed", () => {
    const patch: ActionPatch = { set: { label: "Build" }, remove: ["display"] };
    expect(withoutPlacement(patch)).toEqual({ set: { label: "Build" }, remove: [] });
  });

  it("drops layer from set and remove too", () => {
    expect(withoutPlacement({ set: { label: "Build", display: "build", layer: "web" }, remove: [] })).toEqual({
      set: { label: "Build" },
      remove: [],
    });
    expect(withoutPlacement({ set: { display: "header" }, remove: ["layer", "emoji"] })).toEqual({
      set: {},
      remove: ["emoji"],
    });
  });

  it("returns an equal patch when it carries no placement", () => {
    const patch: ActionPatch = { set: { label: "Build" }, remove: ["emoji"] };
    expect(withoutPlacement(patch)).toEqual(patch);
  });

  it("leaves the patch it was given alone", () => {
    const patch: ActionPatch = { set: { display: "build" }, remove: ["display"] };
    withoutPlacement(patch);
    expect(patch).toEqual({ set: { display: "build" }, remove: ["display"] });
  });
});

describe("placementFromYaml", () => {
  const zones = [zone("build", ["web", "mobile"]), zone("ship")];
  const at = (display: unknown, layer?: unknown) => ({ display, layer });

  it.each([false, true])("keeps the form's placement when the YAML left the display alone (touched: %s)", (displayTouched) => {
    const prev = { display: "build/mobile", displayTouched };
    expect(placementFromYaml(prev, at("footer"), at("footer"), zones)).toEqual(prev);
  });

  it("keeps a zone from a note when the YAML never showed a display", () => {
    const prev = { display: "build/mobile", displayTouched: false };
    expect(placementFromYaml(prev, at(undefined), at(undefined), zones)).toEqual(prev);
  });

  it("keeps the form's placement when display and layer both stayed", () => {
    const prev = { display: "build/mobile", displayTouched: false };
    expect(placementFromYaml(prev, at("build", "mobile"), at("build", "mobile"), zones)).toEqual(prev);
  });

  it.each([
    ["a footer", at(undefined), at("footer"), "footer"],
    ["a known zone", at("footer"), at("ship"), "ship"],
    ["a removed display", at("footer"), at(undefined), "header"],
    ["a display written out as header", at(undefined), at("header"), "header"],
    ["an unknown zone", at(undefined), at("gone"), "header"],
    ["a non-string value", at(undefined), at(3), "header"],
    ["a changed layer", at("build", "web"), at("build", "mobile"), "build/mobile"],
    ["a removed layer", at("build", "mobile"), at("build"), "build/web"],
    ["a layered zone picked", at("footer"), at("build", "mobile"), "build/mobile"],
  ])("reads %s as an edit", (_, shown, next, display) => {
    const prev = { display: "build", displayTouched: false };
    expect(placementFromYaml(prev, shown, next, zones)).toEqual({ display, displayTouched: true });
  });

  it("stays touched when the form's placement was already picked", () => {
    const prev = { display: "footer", displayTouched: true };
    expect(placementFromYaml(prev, at("footer"), at(undefined), zones)).toEqual({ display: "header", displayTouched: true });
  });
});

describe("withDeclaredDisplay", () => {
  it("puts the declaring file's display back and keeps every other field", () => {
    const payload = { label: "Build", cmd: "make", env: { A: "1" }, display: "footer" };
    const declared = { label: "Build", cmd: "make", display: "build" };
    expect(withDeclaredDisplay(payload, declared)).toEqual({
      label: "Build",
      cmd: "make",
      env: { A: "1" },
      display: "build",
    });
  });

  it("adds the display a picked Header took out of the payload", () => {
    expect(withDeclaredDisplay({ cmd: "make" }, { cmd: "make", display: "footer" })).toEqual({
      cmd: "make",
      display: "footer",
    });
  });

  it("puts the declaring file's layer back too", () => {
    expect(
      withDeclaredDisplay({ cmd: "make", display: "build", layer: "mobile" }, { cmd: "make", display: "build", layer: "web" }),
    ).toEqual({ cmd: "make", display: "build", layer: "web" });
    expect(withDeclaredDisplay({ cmd: "make", display: "build", layer: "mobile" }, { cmd: "make", display: "footer" })).toEqual({
      cmd: "make",
      display: "footer",
    });
  });

  it("drops the display when the declaring file has none", () => {
    expect(withDeclaredDisplay({ cmd: "make", display: "footer" }, { cmd: "make" })).toEqual({ cmd: "make" });
  });

  it.each([
    ["both have a display", { cmd: "make", display: "footer" }, { cmd: "make", display: "build" }],
    ["only the payload has a display", { cmd: "make", display: "footer" }, { cmd: "make" }],
    ["only the declaring file has a display", { cmd: "make" }, { cmd: "make", display: "footer" }],
  ])("leaves both objects it was given alone when %s", (_, payload, declared) => {
    const payloadBefore = { ...payload };
    const declaredBefore = { ...declared };
    withDeclaredDisplay(payload, declared);
    expect(payload).toEqual(payloadBefore);
    expect(declared).toEqual(declaredBefore);
  });
});

describe("yamlPlacement", () => {
  it("reads the display and layer of a mapping", () => {
    expect(yamlPlacement("cmd: make\ndisplay: build\nlayer: web\n")).toEqual({ display: "build", layer: "web" });
  });

  it("is undefined for a mapping without a display or layer", () => {
    expect(yamlPlacement("cmd: make\n")).toEqual({ display: undefined, layer: undefined });
  });

  it.each(["", "   \n\n"])("is undefined for empty or whitespace text (%j)", (text) => {
    expect(yamlPlacement(text)).toEqual({ display: undefined, layer: undefined });
  });

  it.each(["- cmd\n- display\n", "just text", "3", "null"])("is undefined for YAML that is not a mapping (%j)", (text) => {
    expect(yamlPlacement(text)).toEqual({ display: undefined, layer: undefined });
  });
});
