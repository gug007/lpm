import { describe, expect, it } from "vitest";
import type { ActionPatch } from "../../actionConfig";
import {
  placementFromYaml,
  placementOf,
  placementPatch,
  withDeclaredDisplay,
  withoutPlacement,
  yamlDisplay,
} from "./actionPlacement";

describe("placementOf", () => {
  it("reads footer, a known zone, or header", () => {
    expect(placementOf("footer", ["build"])).toBe("footer");
    expect(placementOf("build", ["build"])).toBe("build");
    expect(placementOf("", ["build"])).toBe("header");
    expect(placementOf("gone", ["build"])).toBe("header");
  });
});

describe("placementPatch", () => {
  it("writes nothing while placement is untouched", () => {
    expect(placementPatch("build", false)).toEqual({});
  });

  it("writes a touched placement out, header included, so a lower file's display can't show through", () => {
    expect(placementPatch("header", true)).toEqual({ set: "header" });
    expect(placementPatch("footer", true)).toEqual({ set: "footer" });
    expect(placementPatch("build", true)).toEqual({ set: "build" });
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
  const zones = ["build", "ship"];

  it.each([false, true])("keeps the form's placement when the YAML left the display alone (touched: %s)", (displayTouched) => {
    const prev = { display: "build", displayTouched };
    expect(placementFromYaml(prev, "footer", "footer", zones)).toEqual(prev);
  });

  it("keeps a zone from a note when the YAML never showed a display", () => {
    const prev = { display: "build", displayTouched: false };
    expect(placementFromYaml(prev, undefined, undefined, zones)).toEqual(prev);
  });

  it.each([
    ["a footer", undefined, "footer", "footer"],
    ["a known zone", "footer", "ship", "ship"],
    ["a removed display", "footer", undefined, "header"],
    ["a display written out as header", undefined, "header", "header"],
    ["an unknown zone", undefined, "gone", "header"],
    ["a non-string value", undefined, 3, "header"],
  ])("reads %s as an edit", (_, shown, next, display) => {
    const prev = { display: "build", displayTouched: false };
    expect(placementFromYaml(prev, shown, next, zones)).toEqual({ display, displayTouched: true });
  });

  it("stays touched when the form's placement was already picked", () => {
    const prev = { display: "footer", displayTouched: true };
    expect(placementFromYaml(prev, "footer", undefined, zones)).toEqual({ display: "header", displayTouched: true });
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

describe("yamlDisplay", () => {
  it("reads the display of a mapping", () => {
    expect(yamlDisplay("cmd: make\ndisplay: footer\n")).toBe("footer");
  });

  it("is undefined for a mapping without a display", () => {
    expect(yamlDisplay("cmd: make\n")).toBeUndefined();
  });

  it.each(["", "   \n\n"])("is undefined for empty or whitespace text (%j)", (text) => {
    expect(yamlDisplay(text)).toBeUndefined();
  });

  it.each(["- cmd\n- display\n", "just text", "3", "null"])("is undefined for YAML that is not a mapping (%j)", (text) => {
    expect(yamlDisplay(text)).toBeUndefined();
  });
});
