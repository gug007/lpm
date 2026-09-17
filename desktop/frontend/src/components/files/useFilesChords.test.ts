// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { filesChord } from "./useFilesChords";

function key(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

describe("filesChord", () => {
  it("steps files on ⌃⌥ arrows only", () => {
    expect(filesChord(key({ key: "ArrowDown", ctrlKey: true, altKey: true }))).toBe("nextFile");
    expect(filesChord(key({ key: "ArrowUp", ctrlKey: true, altKey: true }))).toBe("prevFile");
    expect(filesChord(key({ key: "ArrowDown", metaKey: true, altKey: true }))).toBeNull();
    expect(filesChord(key({ key: "ArrowDown", altKey: true }))).toBeNull();
  });

  it("saves on plain ⌘S", () => {
    expect(filesChord(key({ key: "s", metaKey: true }))).toBe("save");
    expect(filesChord(key({ key: "S", metaKey: true, shiftKey: true }))).toBeNull();
    expect(filesChord(key({ key: "s", ctrlKey: true }))).toBeNull();
  });

  it("matches the ⌥ letter chords by physical key", () => {
    expect(filesChord(key({ key: "‰", code: "KeyR", metaKey: true, altKey: true }))).toBe("reveal");
    expect(filesChord(key({ key: "ç", code: "KeyC", metaKey: true, altKey: true }))).toBe("copyPath");
    expect(
      filesChord(key({ key: "Ç", code: "KeyC", metaKey: true, altKey: true, shiftKey: true })),
    ).toBe("copyRelativePath");
    expect(filesChord(key({ key: "∫", code: "KeyB", metaKey: true, altKey: true }))).toBe("toggleTree");
    expect(filesChord(key({ key: "r", code: "KeyR", metaKey: true }))).toBeNull();
    expect(filesChord(key({ key: "r", code: "KeyR", altKey: true }))).toBeNull();
  });
});
