import { describe, expect, it } from "vitest";
import {
  captureGlobalKey,
  defaultQuickTerminalKey,
  globalKeyLabel,
  normalizeQuickTerminal,
  parseGlobalKey,
  quickTerminalProblemText,
} from "./quickTerminalKeys";

function press(code: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean }, key = "t") {
  return {
    key,
    code,
    ctrlKey: !!mods.ctrl,
    altKey: !!mods.alt,
    shiftKey: !!mods.shift,
    metaKey: !!mods.meta,
  };
}

describe("quick terminal keys", () => {
  it("defaults to ⌃⌥⌘T on macOS and Ctrl+Alt+Shift+T elsewhere", () => {
    expect(globalKeyLabel(defaultQuickTerminalKey(true), true)).toBe("⌃⌥⌘T");
    expect(globalKeyLabel(defaultQuickTerminalKey(false), false, false)).toBe("Ctrl+Alt+Shift+T");
  });

  it("names the Windows key per platform", () => {
    expect(globalKeyLabel("ctrl+super+Space", false, true)).toBe("Ctrl+Win+Space");
    expect(globalKeyLabel("ctrl+super+Space", false, false)).toBe("Ctrl+Super+Space");
  });

  it("parses only known modifiers and keys", () => {
    expect(parseGlobalKey("ctrl+alt+KeyT")).toEqual({
      ctrl: true,
      alt: true,
      shift: false,
      super: false,
      code: "KeyT",
    });
    expect(parseGlobalKey("hyper+KeyT")).toBeNull();
    expect(parseGlobalKey("ctrl+alt+Escape")).toBeNull();
  });

  it("records a chord by physical key", () => {
    const optionT = press("KeyT", { ctrl: true, alt: true, meta: true }, "†");
    expect(captureGlobalKey(optionT, true)).toEqual({ kind: "capture", canonical: "ctrl+alt+super+KeyT" });
  });

  it("waits while only modifiers are down", () => {
    expect(captureGlobalKey(press("ShiftLeft", { shift: true }), true).kind).toBe("ignore");
  });

  it("asks for two modifiers besides Shift", () => {
    expect(captureGlobalKey(press("KeyT", { meta: true, shift: true }), true).kind).toBe("hint");
    expect(captureGlobalKey(press("KeyT", { ctrl: true, shift: true }), false, false).kind).toBe("hint");
  });

  it("refuses keys a Linux or Windows desktop keeps", () => {
    expect(captureGlobalKey(press("KeyT", { ctrl: true, alt: true }), false, false)).toEqual({
      kind: "hint",
      text: "Your computer already uses that. Press another.",
    });
    expect(captureGlobalKey(press("KeyT", { ctrl: true, alt: true }), true).kind).toBe("capture");
  });

  it("refuses an AltGr character", () => {
    expect(captureGlobalKey(press("KeyE", { ctrl: true, alt: true }, "€"), false, true).kind).toBe("hint");
  });

  it("words a held key with its label", () => {
    expect(quickTerminalProblemText({ kind: "held" }, "ctrl+alt+KeyT")).toMatch(/is held by another app\. Press a different key\.$/);
  });

  it("keeps a saved setting and drops a broken key", () => {
    expect(normalizeQuickTerminal(undefined)).toBeUndefined();
    expect(normalizeQuickTerminal({ enabled: true, key: "ctrl+alt+KeyK" })).toEqual({ enabled: true, key: "ctrl+alt+KeyK" });
    expect(normalizeQuickTerminal({ enabled: true, key: "nonsense" })?.key).toBe(defaultQuickTerminalKey());
  });
});
