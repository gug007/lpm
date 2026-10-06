import { describe, expect, it } from "vitest";
import {
  canonicalShortcut,
  formatShortcut,
  isReservedShortcut,
  parseShortcut,
  reservedShortcutMessage,
  shortcutIdentity,
} from "./shortcutParse";

describe("parseShortcut", () => {
  it("parses a combo with every modifier explicit", () => {
    expect(parseShortcut("cmd+shift+b")).toEqual({
      key: "b",
      meta: true,
      shift: true,
      alt: false,
    });
  });

  it("treats alt/opt/option and cmd/command/ctrl as aliases", () => {
    expect(parseShortcut("option+r")).toEqual({
      key: "r",
      meta: false,
      shift: false,
      alt: true,
    });
    expect(parseShortcut("command+k")?.meta).toBe(true);
    expect(parseShortcut("ctrl+k")?.meta).toBe(true);
  });

  it("rejects plain keys with no Cmd/Alt modifier", () => {
    expect(parseShortcut("b")).toBeNull();
    expect(parseShortcut("shift+b")).toBeNull();
  });

  it("rejects malformed strings and multi-key combos", () => {
    expect(parseShortcut("")).toBeNull();
    expect(parseShortcut("cmd")).toBeNull();
    expect(parseShortcut("cmd+a+b")).toBeNull();
  });
});

describe("canonicalShortcut", () => {
  it("orders modifiers cmd, alt, shift regardless of input order", () => {
    const a = parseShortcut("shift+alt+cmd+b");
    expect(a && canonicalShortcut(a)).toBe("cmd+alt+shift+b");
  });

  it("round-trips a parsed shortcut back to its stored string", () => {
    const parsed = parseShortcut("cmd+shift+b");
    expect(parsed && canonicalShortcut(parsed)).toBe("cmd+shift+b");
  });
});

describe("isReservedShortcut", () => {
  it("flags lpm's built-in and native combos", () => {
    expect(isReservedShortcut(parseShortcut("cmd+b")!)).toBe(true);
    expect(isReservedShortcut(parseShortcut("cmd+t")!)).toBe(true);
    expect(isReservedShortcut(parseShortcut("cmd+1")!)).toBe(true);
    expect(isReservedShortcut(parseShortcut("cmd+,")!)).toBe(true);
    expect(isReservedShortcut(parseShortcut("cmd+p")!)).toBe(true);
    expect(isReservedShortcut(parseShortcut("cmd+shift+e")!)).toBe(true);
    expect(isReservedShortcut(parseShortcut("cmd+alt+shift+c")!)).toBe(true);
    expect(isReservedShortcut(parseShortcut("ctrl+alt+arrowdown")!)).toBe(true);
    expect(isReservedShortcut(parseShortcut("alt+enter")!)).toBe(true);
  });

  it("allows free combos", () => {
    expect(isReservedShortcut(parseShortcut("cmd+shift+b")!)).toBe(false);
    expect(isReservedShortcut(parseShortcut("alt+r")!)).toBe(false);
  });

  it("also blocks combos passed via the extra set", () => {
    const extra = new Set(["cmd+shift+a", "cmd+alt+arrowright"]);
    expect(isReservedShortcut(parseShortcut("cmd+shift+a")!, extra)).toBe(true);
    expect(isReservedShortcut(parseShortcut("cmd+alt+arrowright")!, extra)).toBe(true);
    expect(isReservedShortcut(parseShortcut("cmd+alt+arrowleft")!, extra)).toBe(false);
  });
});

describe("formatShortcut", () => {
  it("renders macOS modifier glyphs", () => {
    expect(formatShortcut(parseShortcut("cmd+shift+b")!)).toBe("⌘⇧B");
    expect(formatShortcut(parseShortcut("alt+enter")!)).toBe("⌥↩");
  });

  it("renders the physical chord in words off macOS", () => {
    expect(formatShortcut(parseShortcut("cmd+b")!, false)).toBe("Ctrl+Shift+B");
    expect(formatShortcut(parseShortcut("cmd+shift+b")!, false)).toBe("Ctrl+Alt+Shift+B");
    expect(formatShortcut(parseShortcut("cmd+pagedown")!, false)).toBe("Ctrl+PageDown");
    expect(formatShortcut(parseShortcut("alt+enter")!, false)).toBe("Alt+Enter");
  });
});

describe("reserved shortcuts off macOS", () => {
  it("swap the file-stepping chords and flag the desktop's own", () => {
    expect(isReservedShortcut(parseShortcut("cmd+alt+pagedown")!, undefined, false)).toBe(true);
    expect(isReservedShortcut(parseShortcut("cmd+alt+pagedown")!, undefined, true)).toBe(false);
    expect(isReservedShortcut(parseShortcut("cmd+alt+arrowdown")!, undefined, false)).toBe(false);
    expect(reservedShortcutMessage(parseShortcut("cmd+alt+arrowdown")!, undefined, false)).toBe(
      "Ctrl+Alt+↓ is reserved by the system",
    );
    expect(reservedShortcutMessage(parseShortcut("cmd+alt+arrowdown")!, undefined, true)).toBe(
      "⌘⌥↓ is reserved by lpm",
    );
    expect(reservedShortcutMessage(parseShortcut("cmd+shift+b")!, undefined, false)).toBeNull();
  });

  it("compare physical chords, where ⌘⇧X and ⌘⌥⇧X are the same keys", () => {
    const shiftC = parseShortcut("cmd+shift+c")!;
    expect(isReservedShortcut(shiftC, undefined, false)).toBe(true);
    expect(isReservedShortcut(shiftC, undefined, true)).toBe(false);
    expect(reservedShortcutMessage(shiftC, undefined, false)).toBe("Ctrl+Alt+Shift+C is reserved by lpm");
    expect(isReservedShortcut(parseShortcut("cmd+alt+shift+r")!, undefined, false)).toBe(true);
    expect(isReservedShortcut(parseShortcut("cmd+alt+shift+r")!, undefined, true)).toBe(false);

    const extra = new Set(["cmd+alt+shift+j"]);
    expect(isReservedShortcut(parseShortcut("cmd+shift+j")!, extra, false)).toBe(true);
    expect(isReservedShortcut(parseShortcut("cmd+shift+j")!, extra, true)).toBe(false);
    expect(isReservedShortcut(parseShortcut("cmd+j")!, extra, false)).toBe(false);
  });

  it("keep a reserved \"+\" key, which parseShortcut can't read back", () => {
    const plus = { key: "+", meta: true, shift: false, alt: false };
    expect(isReservedShortcut(plus, undefined, false)).toBe(true);
    expect(isReservedShortcut(plus, undefined, true)).toBe(true);
    expect(isReservedShortcut({ ...plus, key: "-" }, undefined, false)).toBe(true);
  });
});

describe("shortcutIdentity", () => {
  it("is the stored combo on macOS and the physical chord elsewhere", () => {
    const shifted = parseShortcut("cmd+shift+j")!;
    const optShifted = parseShortcut("cmd+alt+shift+j")!;
    expect(shortcutIdentity(shifted, true)).toBe("cmd+shift+j");
    expect(shortcutIdentity(optShifted, true)).toBe("cmd+alt+shift+j");
    expect(shortcutIdentity(shifted, false)).toBe("ctrl+alt+shift+j");
    expect(shortcutIdentity(optShifted, false)).toBe("ctrl+alt+shift+j");
    expect(shortcutIdentity(parseShortcut("cmd+j")!, false)).toBe("ctrl+shift+j");
  });
});
