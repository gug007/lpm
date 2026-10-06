import { describe, expect, it } from "vitest";
import { isQuitChord, QUIT_CHORD, SETTINGS_CHORD } from "./appMenuKeys";
import { chordLabel, matchesChord } from "./keys";

const key = (k: string, mods: Partial<Record<"ctrl" | "meta" | "shift" | "alt", boolean>> = {}, code = "") => ({
  key: k,
  code,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});

const quitPc = (e: ReturnType<typeof key>) => isQuitChord(e, false);

describe("isQuitChord off macOS", () => {
  it("matches Ctrl+Shift+Q, the physical form of ⌘Q", () => {
    expect(quitPc(key("Q", { ctrl: true, shift: true }))).toBe(true);
    expect(quitPc(key("q", { ctrl: true, shift: true }))).toBe(true);
    expect(chordLabel(QUIT_CHORD, false)).toBe("Ctrl+Shift+Q");
  });

  it("leaves plain Ctrl+Q to the terminal", () => {
    expect(quitPc(key("q", { ctrl: true }))).toBe(false);
  });

  it("ignores Q with any other modifier set", () => {
    expect(quitPc(key("q"))).toBe(false);
    expect(quitPc(key("q", { ctrl: true, alt: true }))).toBe(false);
    expect(quitPc(key("Q", { ctrl: true, alt: true, shift: true }))).toBe(false);
    expect(quitPc(key("q", { meta: true }))).toBe(false);
    expect(quitPc(key("W", { ctrl: true, shift: true }))).toBe(false);
  });

  it("follows the physical Q key on non-Latin layouts", () => {
    expect(quitPc(key("Й", { ctrl: true, shift: true }, "KeyQ"))).toBe(true);
    expect(quitPc(key("й", { ctrl: true }, "KeyQ"))).toBe(false);
  });
});

describe("SETTINGS_CHORD", () => {
  it("is Ctrl+, off macOS and ⌘, on macOS", () => {
    expect(chordLabel(SETTINGS_CHORD, false)).toBe("Ctrl+,");
    expect(chordLabel(SETTINGS_CHORD, true)).toBe("⌘,");
    expect(matchesChord(key(",", { ctrl: true }), SETTINGS_CHORD, false)).toBe(true);
    expect(matchesChord(key(",", { ctrl: true, shift: true }), SETTINGS_CHORD, false)).toBe(false);
  });
});
