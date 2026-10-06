import { describe, expect, it } from "vitest";
import { isBoundChord, matchesShortcut, type KeyboardShortcut } from "./useKeyboardShortcut";

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

const pc = (e: ReturnType<typeof press>, s: KeyboardShortcut) => matchesShortcut(e, s, false);
const mac = (e: ReturnType<typeof press>, s: KeyboardShortcut) => matchesShortcut(e, s, true);

describe("matchesShortcut on macOS", () => {
  it("keeps folding Ctrl into ⌘ and ignoring omitted modifiers", () => {
    const t = { key: "t", meta: true };
    expect(mac(press("t", { meta: true }), t)).toBe(true);
    expect(mac(press("t", { ctrl: true }), t)).toBe(true);
    expect(mac(press("T", { meta: true, shift: true }), t)).toBe(true);
    expect(mac(press("t"), t)).toBe(false);
  });

  it("honours explicit modifiers", () => {
    const e = { key: "e", meta: true, shift: false };
    expect(mac(press("e", { meta: true }), e)).toBe(true);
    expect(mac(press("E", { meta: true, shift: true }), e)).toBe(false);
  });
});

describe("matchesShortcut on Linux and Windows", () => {
  it("matches a ⌘+letter chord only on Ctrl+Shift+letter, never plain Ctrl", () => {
    const t = { key: "t", meta: true, shift: false, alt: false };
    expect(pc(press("T", { ctrl: true, shift: true }), t)).toBe(true);
    expect(pc(press("t", { ctrl: true }), t)).toBe(false);
    expect(pc(press("t", { meta: true }), t)).toBe(false);
  });

  it("moves ⌘⇧ and ⌘⌥ letter chords to the Ctrl+Alt tier", () => {
    const shifted = { key: "r", meta: true, shift: true, alt: false };
    expect(pc(press("R", { ctrl: true, alt: true, shift: true }), shifted)).toBe(true);
    expect(pc(press("R", { ctrl: true, shift: true }), shifted)).toBe(false);
    const opt = { key: "r", meta: true, shift: false, alt: true };
    expect(pc(press("r", { ctrl: true, alt: true }), opt)).toBe(true);
    expect(pc(press("R", { ctrl: true, alt: true, shift: true }), opt)).toBe(false);
  });

  it("treats an omitted Shift on a letter chord as either authored variant", () => {
    const w = { key: "w", meta: true };
    expect(pc(press("W", { ctrl: true, shift: true }), w)).toBe(true);
    expect(pc(press("W", { ctrl: true, alt: true, shift: true }), w)).toBe(true);
    expect(pc(press("w", { ctrl: true }), w)).toBe(false);
  });

  it("never stretches an omitted Alt to the ⌘⌥ tier, so Ctrl+Alt+letter stays C-M-letter", () => {
    expect(pc(press("w", { ctrl: true, alt: true }), { key: "w", meta: true })).toBe(false);
    expect(pc(press("e", { ctrl: true, alt: true }), { key: "e", meta: true, shift: false })).toBe(false);
    expect(pc(press("b", { ctrl: true, alt: true }), { key: "b", meta: true })).toBe(false);
    expect(pc(press("R", { ctrl: true, alt: true, shift: true }), { key: "r", meta: true, shift: true })).toBe(true);
    expect(pc(press("r", { ctrl: true, alt: true }), { key: "r", meta: true, alt: true })).toBe(true);
  });

  it("keeps digits, punctuation and named keys on plain Ctrl", () => {
    expect(pc(press("1", { ctrl: true }), { key: "1", meta: true })).toBe(true);
    expect(pc(press("=", { ctrl: true }), { key: "=", meta: true })).toBe(true);
    expect(pc(press("+", { ctrl: true, shift: true }), { key: "+", meta: true })).toBe(true);
    expect(pc(press("PageDown", { ctrl: true }), { key: "pagedown", meta: true, shift: false, alt: false })).toBe(true);
    expect(pc(press("Backspace", { ctrl: true, shift: true }), { key: "backspace", meta: true, shift: true, alt: false })).toBe(true);
  });

  it("requires neither Ctrl nor Super for meta: false", () => {
    const j = { key: "j", meta: false };
    expect(pc(press("j"), j)).toBe(true);
    expect(pc(press("j", { ctrl: true }), j)).toBe(false);
    expect(pc(press("j", { meta: true }), j)).toBe(false);
  });

  it("never fires a chord for an AltGr character", () => {
    const at = { key: "@", meta: true, alt: true };
    expect(pc(press("@", { ctrl: true, alt: true, altGraph: true }), at)).toBe(false);
    expect(pc(press("@", { ctrl: true, alt: true }), at)).toBe(true);
    const ogonek = { key: "ą", meta: true, alt: true };
    expect(pc(press("ą", { ctrl: true, alt: true }), ogonek)).toBe(false);
  });

  it("follows the physical key for letter chords on non-Latin layouts", () => {
    const t = { key: "t", meta: true, shift: false, alt: false };
    expect(pc(press("Е", { ctrl: true, shift: true }, "KeyT"), t)).toBe(true);
    expect(pc(press("е", { ctrl: true }, "KeyT"), t)).toBe(false);
    expect(pc(press("о", {}, "KeyJ"), { key: "j", meta: false })).toBe(false);
  });

  it("only reports live modifier chords as bound", () => {
    expect(isBoundChord(press("T", { ctrl: true, shift: true }), false)).toBe(false);
  });
});
