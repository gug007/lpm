import { describe, expect, it, vi } from "vitest";
import { handleSelectAllShortcut, isCopyShortcut, isPasteShortcut } from "./copySelection";

function key(over: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    type: "keydown",
    key: "c",
    code: "",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...over,
  } as unknown as KeyboardEvent;
}

describe("terminal copy and paste chords", () => {
  it("copy on ⌘C on macOS, Ctrl+Shift+C elsewhere", () => {
    expect(isCopyShortcut(key({ metaKey: true }), true)).toBe(true);
    expect(isCopyShortcut(key({ key: "C", ctrlKey: true, shiftKey: true }), true)).toBe(false);
    expect(isCopyShortcut(key({ key: "C", ctrlKey: true, shiftKey: true }), false)).toBe(true);
    expect(isCopyShortcut(key({ key: "С", code: "KeyC", ctrlKey: true, shiftKey: true }), false)).toBe(true);
    expect(isCopyShortcut(key({ ctrlKey: true }), false)).toBe(false);
    expect(isCopyShortcut(key({ metaKey: true }), false)).toBe(false);
  });

  it("paste on Ctrl+Shift+V off macOS only", () => {
    expect(isPasteShortcut(key({ key: "V", ctrlKey: true, shiftKey: true }), false)).toBe(true);
    expect(isPasteShortcut(key({ key: "v", ctrlKey: true }), false)).toBe(false);
    expect(isPasteShortcut(key({ key: "v", metaKey: true }), true)).toBe(false);
  });

  it("select all on ⌘A on macOS, Ctrl+Shift+A elsewhere", () => {
    const term = { selectAll: vi.fn() } as never;
    expect(handleSelectAllShortcut(key({ key: "a", metaKey: true }), term, true)).toBe(true);
    expect(handleSelectAllShortcut(key({ key: "a", ctrlKey: true }), term, false)).toBe(false);
    expect(handleSelectAllShortcut(key({ key: "A", ctrlKey: true, shiftKey: true }), term, false)).toBe(true);
  });
});
