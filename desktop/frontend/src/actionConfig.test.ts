import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { setPlacementNote } from "./actionConfig";

const doc = (yaml: string) => YAML.parseDocument(yaml);

describe("setPlacementNote", () => {
  it.each(["test", "footer", "header"])("writes %s into a note that already has a display", (display) => {
    const parsed = doc("actions:\n  deploy:\n    position: 2\n    display: build\n  lint:\n    cmd: make lint\n");

    expect(setPlacementNote(parsed, "deploy", display)).toBe(true);

    expect(parsed.toJSON()).toEqual({
      actions: { deploy: { position: 2, display }, lint: { cmd: "make lint" } },
    });
  });

  it("finds the note under terminals", () => {
    const parsed = doc("terminals:\n  shell:\n    position: 1\n    display: build\n");

    expect(setPlacementNote(parsed, "shell", "footer")).toBe(true);

    expect(parsed.toJSON()).toEqual({ terminals: { shell: { position: 1, display: "footer" } } });
  });

  it.each([
    ["a command", "actions:\n  deploy:\n    cmd: make deploy\n    display: build\n"],
    ["child actions", "actions:\n  deploy:\n    display: build\n    actions:\n      one:\n        cmd: make one\n"],
    ["a command written as a string", "actions:\n  deploy: make deploy\n"],
    ["no value", "actions:\n  deploy:\n"],
    ["only a position", "actions:\n  deploy:\n    position: 2\n"],
  ])("leaves an entry with %s alone", (_, yaml) => {
    const parsed = doc(yaml);
    const before = String(parsed);

    expect(setPlacementNote(parsed, "deploy", "footer")).toBe(false);

    expect(String(parsed)).toBe(before);
  });

  it("leaves the doc alone when the key is missing", () => {
    const parsed = doc("actions:\n  lint:\n    position: 1\n    display: build\n");
    const before = String(parsed);

    expect(setPlacementNote(parsed, "deploy", "footer")).toBe(false);

    expect(String(parsed)).toBe(before);
  });
});
