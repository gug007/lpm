// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { firesForTarget, inTextScope } from "./shortcutScope";

function tree() {
  const root = document.createElement("div");
  const scope = document.createElement("div");
  scope.setAttribute("data-text-scope", "");
  const inner = document.createElement("span");
  scope.appendChild(inner);
  const outside = document.createElement("div");
  root.append(scope, outside);
  return { scope, inner, outside };
}

describe("inTextScope", () => {
  it("matches the scope element and its descendants", () => {
    const { scope, inner } = tree();
    expect(inTextScope(scope)).toBe(true);
    expect(inTextScope(inner)).toBe(true);
  });

  it("does not match outside the scope, or a null target", () => {
    expect(inTextScope(tree().outside)).toBe(false);
    expect(inTextScope(null)).toBe(false);
  });
});

describe("firesForTarget", () => {
  const cmdE = { key: "e", meta: true };
  const cmdD = { key: "d", meta: true, whileTyping: false };

  it("fires by default inside a text scope", () => {
    expect(firesForTarget(cmdE, tree().inner)).toBe(true);
  });

  it("stands down inside a text scope when opted out", () => {
    expect(firesForTarget(cmdD, tree().inner)).toBe(false);
  });

  it("still fires outside a text scope when opted out", () => {
    expect(firesForTarget(cmdD, tree().outside)).toBe(true);
  });
});
