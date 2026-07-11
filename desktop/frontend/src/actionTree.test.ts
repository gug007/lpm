import { describe, expect, it } from "vitest";
import { findActionByPath, resolveRunnableAction } from "./actionTree";
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

describe("resolveRunnableAction", () => {
  // The real-world case: `claude` is a nested child of `claude-max`, so its id is
  // `claude-max:claude`. `lpm run claude` passes the bare leaf name.
  const claudeTree: ActionInfo[] = [
    node("claude-max", [node("claude-max:claude"), node("claude-max:codex")]),
    node("claude-ultracode"),
  ];

  it("resolves an exact composite id like findActionByPath", () => {
    expect(resolveRunnableAction(claudeTree, "claude-max")?.name).toBe("claude-max");
    expect(resolveRunnableAction(claudeTree, "claude-max:claude")?.name).toBe(
      "claude-max:claude",
    );
  });
  it("falls back to a unique leaf key for a bare nested name", () => {
    expect(resolveRunnableAction(claudeTree, "claude")?.name).toBe("claude-max:claude");
    expect(resolveRunnableAction(claudeTree, "codex")?.name).toBe("claude-max:codex");
  });
  it("does not fall back when the id already has a separator", () => {
    expect(resolveRunnableAction(claudeTree, "nope:claude")).toBeNull();
  });
  it("returns null when a bare leaf name is ambiguous", () => {
    const ambiguous: ActionInfo[] = [
      node("a", [node("a:claude")]),
      node("b", [node("b:claude")]),
    ];
    expect(resolveRunnableAction(ambiguous, "claude")).toBeNull();
  });
  it("returns null for an unknown bare name", () => {
    expect(resolveRunnableAction(claudeTree, "ghost")).toBeNull();
  });
});
