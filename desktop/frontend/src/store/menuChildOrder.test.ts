import { describe, expect, it } from "vitest";
import { menuChildOrderFor } from "../actionTree";
import type { ActionInfo } from "../types";

function node(name: string, children?: ActionInfo[]): ActionInfo {
  return { name, label: name, cmd: "", confirm: false, display: "header", children };
}

const tree: ActionInfo[] = [
  node("Build", [
    node("Build:iOS", [node("Build:iOS:Release"), node("Build:iOS:Debug")]),
    node("Build:Android"),
  ]),
  node("Test"),
];

describe("menuChildOrderFor", () => {
  it("returns leaf keys for a depth-2 parent (unchanged depth-2 behavior)", () => {
    expect(menuChildOrderFor(tree, "Build")).toEqual(["iOS", "Android"]);
  });

  it("returns leaf keys for a depth-3 parent", () => {
    expect(menuChildOrderFor(tree, "Build:iOS")).toEqual(["Release", "Debug"]);
  });

  it("returns [] for a parent with no children", () => {
    expect(menuChildOrderFor(tree, "Test")).toEqual([]);
  });

  it("returns [] for an unknown parent path", () => {
    expect(menuChildOrderFor(tree, "Build:Nope")).toEqual([]);
  });
});
