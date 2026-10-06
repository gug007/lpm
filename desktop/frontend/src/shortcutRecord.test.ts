import { describe, expect, it } from "vitest";
import { captureShortcut, shortcutRequirementHint } from "./shortcutRecord";

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

const pc = (key: string, mods: Mods = {}, reserved?: ReadonlySet<string>) =>
  captureShortcut(press(key, mods), reserved, false);
const mac = (key: string, mods: Mods = {}, reserved?: ReadonlySet<string>) =>
  captureShortcut(press(key, mods), reserved, true);

describe("captureShortcut on macOS", () => {
  it("records ⌘ and ⌥ chords as before", () => {
    expect(mac("J", { meta: true, shift: true })).toEqual({ kind: "capture", canonical: "cmd+shift+j" });
    expect(mac("j", { ctrl: true })).toEqual({ kind: "capture", canonical: "cmd+j" });
    expect(mac("ArrowRight", { alt: true })).toEqual({ kind: "capture", canonical: "alt+arrowright" });
  });

  it("explains missing modifiers and reserved combos in macOS glyphs", () => {
    expect(mac("j")).toEqual({ kind: "hint", text: "Add ⌘ or ⌥ to make a shortcut" });
    expect(mac("t", { meta: true })).toEqual({ kind: "hint", text: "⌘T is reserved by lpm" });
    expect(mac("j", { meta: true }, new Set(["cmd+j"]))).toEqual({ kind: "hint", text: "⌘J is reserved by lpm" });
    expect(mac("Shift", { shift: true })).toEqual({ kind: "ignore" });
  });
});

describe("captureShortcut on Linux and Windows", () => {
  it("stores the ⌘ chord a physical press stands for", () => {
    expect(pc("J", { ctrl: true, shift: true })).toEqual({ kind: "capture", canonical: "cmd+j" });
    expect(pc("j", { ctrl: true, alt: true })).toEqual({ kind: "capture", canonical: "cmd+alt+j" });
    expect(pc("J", { ctrl: true, alt: true, shift: true })).toEqual({ kind: "capture", canonical: "cmd+shift+j" });
    expect(pc("F5", { ctrl: true })).toEqual({ kind: "capture", canonical: "cmd+f5" });
    expect(pc("Enter", { alt: true, shift: true })).toEqual({ kind: "capture", canonical: "alt+shift+enter" });
  });

  it("records the Latin letter of the physical key on non-Latin layouts", () => {
    expect(captureShortcut(press("О", { ctrl: true, shift: true }, "KeyJ"), undefined, false)).toEqual({
      kind: "capture",
      canonical: "cmd+j",
    });
    expect(captureShortcut(press("о", { ctrl: true }, "KeyJ"), undefined, false)).toEqual({
      kind: "hint",
      text: "Ctrl+J is kept for the terminal. Add Shift",
    });
  });

  it("keeps plain Ctrl+letter, Alt+letter and terminal control keys for the terminal", () => {
    expect(pc("j", { ctrl: true })).toEqual({ kind: "hint", text: "Ctrl+J is kept for the terminal. Add Shift" });
    expect(pc("j", { alt: true })).toEqual({ kind: "hint", text: "Alt+J is kept for the terminal. Add Ctrl" });
    expect(pc("[", { ctrl: true })).toEqual({ kind: "hint", text: "Ctrl+[ is kept for the terminal" });
    expect(pc("j")).toEqual({ kind: "hint", text: "Add Ctrl to make a shortcut" });
  });

  it("refuses Super/Win, AltGr characters and system chords", () => {
    expect(pc("j", { meta: true })).toEqual({ kind: "hint", text: "Super shortcuts belong to the system" });
    expect(pc("@", { ctrl: true, alt: true, altGraph: true })).toEqual({
      kind: "hint",
      text: "Add Ctrl to make a shortcut",
    });
    expect(pc("ArrowLeft", { ctrl: true, alt: true })).toEqual({
      kind: "hint",
      text: "Ctrl+Alt+← is reserved by the system",
    });
    expect(pc("t", { ctrl: true, alt: true })).toEqual({
      kind: "hint",
      text: "Ctrl+Alt+T is reserved by the system",
    });
    expect(pc("Tab", { alt: true })).toEqual({ kind: "hint", text: "Alt+Tab is reserved by the system" });
  });

  it("names lpm's own chords by their physical keys", () => {
    expect(pc("T", { ctrl: true, shift: true })).toEqual({ kind: "hint", text: "Ctrl+Shift+T is reserved by lpm" });
    expect(pc("PageDown", { ctrl: true, alt: true })).toEqual({
      kind: "hint",
      text: "Ctrl+Alt+PageDown is reserved by lpm",
    });
    expect(pc("J", { ctrl: true, shift: true }, new Set(["cmd+j"]))).toEqual({
      kind: "hint",
      text: "Ctrl+Shift+J is reserved by lpm",
    });
  });

  it("blocks a chord that lands on a reserved one's physical keys", () => {
    expect(pc("C", { ctrl: true, alt: true, shift: true })).toEqual({
      kind: "hint",
      text: "Ctrl+Alt+Shift+C is reserved by lpm",
    });
    expect(pc("J", { ctrl: true, alt: true, shift: true }, new Set(["cmd+alt+shift+j"]))).toEqual({
      kind: "hint",
      text: "Ctrl+Alt+Shift+J is reserved by lpm",
    });
  });

  it("words the requirement for each platform", () => {
    expect(shortcutRequirementHint(true)).toBe("Requires ⌘ or ⌥.");
    expect(shortcutRequirementHint(false)).toBe("Requires Ctrl, plus Shift or Alt for letters.");
  });
});
