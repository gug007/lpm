import { describe, expect, it } from "vitest";
import { findActionByPath } from "./actionTree";
import type { ActionInfo } from "./types";

function node(name: string, children?: ActionInfo[]): ActionInfo {
  return {
    name,
    label: name,
    cmd: "",
    confirm: false,
    display: "header",
    children,
  };
}

const tree: ActionInfo[] = [
  node("Build", [
    node("Build:iOS", [node("Build:iOS:Release"), node("Build:iOS:Debug")]),
    node("Build:Android"),
  ]),
  node("Test"),
];

describe("findActionByPath", () => {
  it("resolves a first-level id exactly as a flat find would", () => {
    expect(findActionByPath(tree, "Build")?.name).toBe("Build");
    expect(findActionByPath(tree, "Test")?.name).toBe("Test");
  });
  it("resolves a child id", () => {
    expect(findActionByPath(tree, "Build:iOS")?.name).toBe("Build:iOS");
    expect(findActionByPath(tree, "Build:Android")?.name).toBe("Build:Android");
  });
  it("resolves a grandchild id (the deep-drag overlay case)", () => {
    expect(findActionByPath(tree, "Build:iOS:Release")?.name).toBe("Build:iOS:Release");
    expect(findActionByPath(tree, "Build:iOS:Debug")?.name).toBe("Build:iOS:Debug");
  });
  it("returns null for unknown ids at any depth", () => {
    expect(findActionByPath(tree, "Nope")).toBeNull();
    expect(findActionByPath(tree, "Build:Nope")).toBeNull();
    expect(findActionByPath(tree, "Build:iOS:Nope")).toBeNull();
  });
});
