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

  it("flips the Markdown preview on ⌘⇧V", () => {
    expect(filesChord(key({ key: "V", metaKey: true, shiftKey: true }))).toBe("togglePreview");
    expect(filesChord(key({ key: "v", metaKey: true }))).toBeNull();
    expect(filesChord(key({ key: "V", ctrlKey: true, shiftKey: true }))).toBeNull();
  });

  it("matches the ⌥ letter chords by physical key", () => {
    expect(filesChord(key({ key: "‰", code: "KeyR", metaKey: true, altKey: true }))).toBe("reveal");
    expect(filesChord(key({ key: "ç", code: "KeyC", metaKey: true, altKey: true }))).toBe("copyPath");
    expect(
      filesChord(key({ key: "Ç", code: "KeyC", metaKey: true, altKey: true, shiftKey: true })),
    ).toBe("copyRelativePath");
    expect(filesChord(key({ key: "∫", code: "KeyB", metaKey: true, altKey: true }))).toBeNull();
    expect(filesChord(key({ key: "r", code: "KeyR", metaKey: true }))).toBeNull();
    expect(filesChord(key({ key: "r", code: "KeyR", altKey: true }))).toBeNull();
  });
});

describe("filesChord off macOS", () => {
  const pc = (init: KeyboardEventInit) => filesChord(key(init), false);

  it("saves on Ctrl+S and on ⌘S's physical Ctrl+Shift+S", () => {
    expect(pc({ key: "s", ctrlKey: true })).toBe("save");
    expect(pc({ key: "S", ctrlKey: true, shiftKey: true })).toBe("save");
    expect(pc({ key: "s", metaKey: true })).toBeNull();
  });

  it("uses the Ctrl+Alt tier for the ⌘⌥ and ⌘⇧ chords", () => {
    expect(pc({ key: "r", code: "KeyR", ctrlKey: true, altKey: true })).toBe("reveal");
    expect(pc({ key: "c", code: "KeyC", ctrlKey: true, altKey: true })).toBe("copyPath");
    expect(pc({ key: "C", code: "KeyC", ctrlKey: true, altKey: true, shiftKey: true })).toBe(
      "copyRelativePath",
    );
    expect(pc({ key: "V", ctrlKey: true, altKey: true, shiftKey: true })).toBe("togglePreview");
    expect(pc({ key: "V", ctrlKey: true, shiftKey: true })).toBeNull();
  });

  it("steps files on Ctrl+Alt+PageDown / PageUp, leaving Ctrl+Alt+arrows to the desktop", () => {
    expect(pc({ key: "PageDown", ctrlKey: true, altKey: true })).toBe("nextFile");
    expect(pc({ key: "PageUp", ctrlKey: true, altKey: true })).toBe("prevFile");
    expect(pc({ key: "ArrowDown", ctrlKey: true, altKey: true })).toBeNull();
  });

  it("lets AltGr characters type", () => {
    expect(pc({ key: "ć", code: "KeyC", ctrlKey: true, altKey: true })).toBeNull();
  });
});
