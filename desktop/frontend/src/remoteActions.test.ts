import { describe, expect, it } from "vitest";
import { runnableActions } from "./remoteActions";
import type { ActionInfo } from "./types";

function node(name: string, children?: ActionInfo[]): ActionInfo {
  return { name, label: name, cmd: "", confirm: false, display: "header", children };
}

describe("runnableActions", () => {
  it("returns leaves in order, descending into menus", () => {
    const tree = [
      node("Build", [node("Build:iOS"), node("Build:Android")]),
      node("Test"),
    ];
    expect(runnableActions(tree).map((a) => a.name)).toEqual([
      "Build:iOS",
      "Build:Android",
      "Test",
    ]);
  });

  it("treats a node with an empty children array as a leaf", () => {
    expect(runnableActions([node("Run", [])]).map((a) => a.name)).toEqual(["Run"]);
  });

  it("handles undefined/empty input", () => {
    expect(runnableActions(undefined)).toEqual([]);
    expect(runnableActions([])).toEqual([]);
  });
});
