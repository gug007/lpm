import { describe, expect, it } from "vitest";
import { chordLabel, matchesChord, toPhysical } from "./keys";

const press = (key: string, mods: Partial<Record<"ctrl" | "meta" | "shift" | "alt", boolean>> = {}) => ({
  key,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});

describe("toPhysical", () => {
  it("keeps macOS chords as authored", () => {
    expect(toPhysical({ key: "t", meta: true }, true)).toEqual({
      key: "t",
      ctrl: false,
      meta: true,
      shift: false,
      alt: false,
    });
  });

  it("moves letter chords to Ctrl+Shift so plain Ctrl stays with the terminal", () => {
    expect(chordLabel({ key: "t", meta: true }, false)).toBe("Ctrl+Shift+T");
    expect(chordLabel({ key: "w", meta: true }, false)).toBe("Ctrl+Shift+W");
  });

  it("moves already-shifted letter chords to the Ctrl+Alt tier", () => {
    expect(chordLabel({ key: "d", meta: true, shift: true }, false)).toBe("Ctrl+Alt+Shift+D");
    expect(chordLabel({ key: "r", meta: true, alt: true }, false)).toBe("Ctrl+Alt+R");
  });

  it("keeps digits, punctuation and named keys on plain Ctrl", () => {
    expect(chordLabel({ key: "1", meta: true }, false)).toBe("Ctrl+1");
    expect(chordLabel({ key: ",", meta: true }, false)).toBe("Ctrl+,");
    expect(chordLabel({ key: "Enter", meta: true }, false)).toBe("Ctrl+Enter");
  });

  it("renders macOS glyphs on macOS", () => {
    expect(chordLabel({ key: "d", meta: true, shift: true }, true)).toBe("⌘⇧D");
  });

  it("moves ⌘U off the input method's Ctrl+Shift+U on Linux only", () => {
    expect(toPhysical({ key: "u", meta: true }, false, true)).toEqual({
      key: "u",
      ctrl: true,
      meta: false,
      shift: false,
      alt: true,
    });
    expect(chordLabel({ key: "u", meta: true }, false)).toBe("Ctrl+Shift+U");
    expect(toPhysical({ key: "u", meta: true }, true, true).meta).toBe(true);
    expect(toPhysical({ key: "t", meta: true }, false, true).shift).toBe(true);
  });
});

describe("matchesChord", () => {
  it("never matches a plain Ctrl+letter off macOS", () => {
    expect(matchesChord(press("c", { ctrl: true }), { key: "c", meta: true }, false)).toBe(false);
    expect(matchesChord(press("C", { ctrl: true, shift: true }), { key: "c", meta: true }, false)).toBe(true);
  });

  it("matches ⌘ exactly on macOS", () => {
    expect(matchesChord(press("t", { meta: true }), { key: "t", meta: true }, true)).toBe(true);
    expect(matchesChord(press("t", { ctrl: true }), { key: "t", meta: true }, true)).toBe(false);
  });
});
