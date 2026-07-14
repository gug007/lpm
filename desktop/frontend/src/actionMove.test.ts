import { describe, expect, it } from "vitest";
import YAML from "yaml";
import {
  actionEntryToPayload,
  findActionSection,
  moveActionBetweenDocs,
} from "./actionConfig";

const doc = (yaml: string) => YAML.parseDocument(yaml || "{}");

const payloadAt = (
  parsed: ReturnType<typeof YAML.parseDocument>,
  key: string,
) => {
  const match = findActionSection(parsed, key);
  if (!match) return null;
  return actionEntryToPayload(match.node.get(key, true));
};

describe("moveActionBetweenDocs", () => {
  it("moves an action between the actions section of two docs", () => {
    const source = doc("actions:\n  build:\n    cmd: npm run build\n    label: Build\n");
    const target = doc("{}");

    moveActionBetweenDocs(source, target, "build");

    expect(findActionSection(source, "build")).toBeNull();
    expect(findActionSection(target, "build")?.section).toBe("actions");
    expect(payloadAt(target, "build")).toEqual({
      cmd: "npm run build",
      label: "Build",
    });
  });

  it("preserves the terminals section when moving a terminal entry", () => {
    const source = doc("terminals:\n  shell:\n    cmd: zsh\n    label: Shell\n");
    const target = doc("actions:\n  other:\n    cmd: echo hi\n");

    moveActionBetweenDocs(source, target, "shell");

    expect(findActionSection(target, "shell")?.section).toBe("terminals");
    expect(target.get("actions")).toBeDefined();
    expect(payloadAt(target, "shell")).toEqual({ cmd: "zsh", label: "Shell" });
  });

  it("throws and leaves both docs untouched when the target already defines the key", () => {
    const source = doc("actions:\n  build:\n    cmd: npm run build\n");
    const target = doc("actions:\n  build:\n    cmd: make\n");
    const sourceBefore = String(source);
    const targetBefore = String(target);

    expect(() => moveActionBetweenDocs(source, target, "build")).toThrow(
      /already exists/,
    );
    expect(String(source)).toBe(sourceBefore);
    expect(String(target)).toBe(targetBefore);
  });

  it("overwrites a thin (position-only) override in the target", () => {
    const source = doc("actions:\n  build:\n    cmd: npm run build\n");
    const target = doc("actions:\n  build:\n    position: 3\n");

    moveActionBetweenDocs(source, target, "build");

    expect(payloadAt(target, "build")).toEqual({ cmd: "npm run build" });
  });

  it("removes the emptied section from the source doc", () => {
    const source = doc("actions:\n  build:\n    cmd: npm run build\n");
    const target = doc("{}");

    moveActionBetweenDocs(source, target, "build");

    expect(source.get("actions")).toBeUndefined();
    expect(String(source).includes("actions")).toBe(false);
  });

  it("keeps sibling entries in the source section", () => {
    const source = doc(
      "actions:\n  build:\n    cmd: npm run build\n  test:\n    cmd: npm test\n",
    );
    const target = doc("{}");

    moveActionBetweenDocs(source, target, "build");

    expect(findActionSection(source, "build")).toBeNull();
    expect(payloadAt(source, "test")).toEqual({ cmd: "npm test" });
  });

  it("carries unmanaged fields (env, inputs, position) along with the move", () => {
    const source = doc(
      "actions:\n" +
        "  deploy:\n" +
        "    cmd: npm run deploy\n" +
        "    env:\n      TOKEN: abc\n" +
        "    inputs:\n      target:\n        label: Target\n" +
        "    position: 5\n",
    );
    const target = doc("{}");

    moveActionBetweenDocs(source, target, "deploy");

    expect(payloadAt(target, "deploy")).toEqual({
      cmd: "npm run deploy",
      env: { TOKEN: "abc" },
      inputs: { target: { label: "Target" } },
      position: 5,
    });
  });

  it("throws for a missing key without mutating the target", () => {
    const source = doc("actions:\n  build:\n    cmd: npm run build\n");
    const target = doc("{}");
    const targetBefore = String(target);

    expect(() => moveActionBetweenDocs(source, target, "missing")).toThrow(
      /Couldn't find/,
    );
    expect(String(target)).toBe(targetBefore);
  });
});
