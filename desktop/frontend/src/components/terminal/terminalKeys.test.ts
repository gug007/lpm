import { describe, expect, it } from "vitest";
import { readOnlyTerminalYields, terminalYieldsToApp } from "./terminalKeys";

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

const unbound = () => false;
const bound = () => true;

describe("terminalYieldsToApp", () => {
  it("hands every ⌘ chord to the app on macOS and nothing else", () => {
    expect(terminalYieldsToApp(press("t", { meta: true }), unbound, true)).toBe(true);
    expect(terminalYieldsToApp(press("c", { ctrl: true }), bound, true)).toBe(false);
    expect(terminalYieldsToApp(press("a"), bound, true)).toBe(false);
  });

  it("keeps plain Ctrl+letter with the shell off macOS", () => {
    for (const key of ["c", "d", "w", "r", "z", "l", "a"]) {
      expect(terminalYieldsToApp(press(key, { ctrl: true }), unbound, false), key).toBe(false);
    }
  });

  it("hands Ctrl+Shift+letter to the app, on any layout", () => {
    expect(terminalYieldsToApp(press("T", { ctrl: true, shift: true }), unbound, false)).toBe(true);
    expect(terminalYieldsToApp(press("Е", { ctrl: true, shift: true }, "KeyT"), unbound, false)).toBe(true);
  });

  it("hands over other modifier chords only while lpm has them bound", () => {
    const tabNext = press("PageDown", { ctrl: true });
    expect(terminalYieldsToApp(tabNext, unbound, false)).toBe(false);
    expect(terminalYieldsToApp(tabNext, bound, false)).toBe(true);
    const altB = press("b", { alt: true });
    expect(terminalYieldsToApp(altB, unbound, false)).toBe(false);
    expect(terminalYieldsToApp(press("b"), bound, false)).toBe(false);
  });

  it("lets AltGr characters type, and Super chords go to the app", () => {
    expect(terminalYieldsToApp(press("@", { ctrl: true, alt: true, altGraph: true }), bound, false)).toBe(false);
    expect(terminalYieldsToApp(press("ę", { ctrl: true, alt: true }), bound, false)).toBe(false);
    expect(terminalYieldsToApp(press("t", { meta: true }), unbound, false)).toBe(true);
  });
});

describe("readOnlyTerminalYields", () => {
  it("leaves macOS unchanged and hands modified keys to the app elsewhere", () => {
    expect(readOnlyTerminalYields(press("t", { ctrl: true }), true)).toBe(false);
    expect(readOnlyTerminalYields(press("t", { ctrl: true }), false)).toBe(true);
    expect(readOnlyTerminalYields(press("t"), false)).toBe(false);
  });
});
