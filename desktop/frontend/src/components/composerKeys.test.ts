import { describe, expect, it } from "vitest";
import { composerChord, composerKeepsCtrlChord, isFormatChord, isFormatInput } from "./composerKeys";

type Mods = Partial<Record<"ctrl" | "meta" | "shift" | "alt" | "altGraph", boolean>>;

const press = (key: string, mods: Mods = {}, code = "") => ({
  key,
  code,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
  getModifierState: (k: string) => k === "AltGraph" && !!mods.altGraph,
});

describe("composerChord", () => {
  it("leaves macOS to WebKit's own bindings and the ⌘ handlers", () => {
    expect(composerChord(press("a", { ctrl: true }), true)).toBeNull();
    expect(composerChord(press("z", { meta: true }), true)).toBeNull();
  });

  it("gives plain Ctrl the readline-style editing keys and undo", () => {
    const chord = (key: string) => composerChord(press(key, { ctrl: true }), false);
    expect(chord("a")).toBe("lineStart");
    expect(chord("e")).toBe("lineEnd");
    expect(chord("k")).toBe("killLineEnd");
    expect(chord("u")).toBe("killLineStart");
    expect(chord("w")).toBe("killWordBack");
    expect(chord("b")).toBe("charBack");
    expect(chord("i")).toBe("noFormat");
    expect(chord("z")).toBe("undo");
    expect(chord("y")).toBe("redo");
  });

  it("leaves plain Ctrl+C/X/V to the field's native copy, cut and paste", () => {
    for (const key of ["c", "x", "v"]) {
      expect(composerChord(press(key, { ctrl: true }), false), key).toBeNull();
    }
  });

  it("maps the physical forms of ⌘A/C/X/V and the composer's ⌘⇧T/W", () => {
    const shift = (key: string) => composerChord(press(key, { ctrl: true, shift: true }), false);
    expect(shift("A")).toBe("selectAll");
    expect(shift("C")).toBe("copy");
    expect(shift("V")).toBe("paste");
    expect(shift("Z")).toBe("redo");
    expect(shift("T")).toBeNull();
    const tier = (key: string) => composerChord(press(key, { ctrl: true, alt: true, shift: true }), false);
    expect(tier("T")).toBe("newTab");
    expect(tier("W")).toBe("closeTab");
  });

  it("never claims an AltGr character", () => {
    expect(composerChord(press("Ŧ", { ctrl: true, alt: true, shift: true }, "KeyT"), false)).toBeNull();
    expect(composerChord(press("ę", { ctrl: true, alt: true, altGraph: true }, "KeyE"), false)).toBeNull();
  });
});

describe("composerKeepsCtrlChord", () => {
  it("keeps every Ctrl chord on macOS", () => {
    expect(composerKeepsCtrlChord(press("T", { ctrl: true, shift: true }), true)).toBe(true);
    expect(composerKeepsCtrlChord(press("t", { meta: true }), true)).toBe(false);
  });

  it("keeps only the field's own Ctrl keys elsewhere so app chords escape", () => {
    const keeps = (key: string, mods: Mods) => composerKeepsCtrlChord(press(key, mods), false);
    expect(keeps("a", { ctrl: true })).toBe(true);
    expect(keeps("ArrowLeft", { ctrl: true, shift: true })).toBe(true);
    expect(keeps("Backspace", { ctrl: true })).toBe(true);
    expect(keeps("T", { ctrl: true, shift: true })).toBe(false);
    expect(keeps("e", { ctrl: true, alt: true })).toBe(false);
    expect(keeps("1", { ctrl: true })).toBe(false);
    expect(keeps("PageDown", { ctrl: true })).toBe(false);
  });
});

describe("rich-text formatting", () => {
  it("flags Ctrl+B/I/U off macOS only", () => {
    expect(isFormatChord(press("b", { ctrl: true }), false)).toBe(true);
    expect(isFormatChord(press("u", { ctrl: true }), false)).toBe(true);
    expect(isFormatChord(press("B", { ctrl: true, shift: true }), false)).toBe(false);
    expect(isFormatChord(press("b", { ctrl: true }), true)).toBe(false);
    expect(isFormatInput("formatBold")).toBe(true);
    expect(isFormatInput("insertText")).toBe(false);
  });
});
