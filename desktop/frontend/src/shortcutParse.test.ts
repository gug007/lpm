import { describe, expect, it } from "vitest";
import {
  canonicalShortcut,
  formatShortcut,
  isReservedShortcut,
  parseShortcut,
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
  });

  it("allows free combos", () => {
    expect(isReservedShortcut(parseShortcut("cmd+shift+b")!)).toBe(false);
    expect(isReservedShortcut(parseShortcut("alt+r")!)).toBe(false);
  });
});

describe("formatShortcut", () => {
  it("renders macOS modifier glyphs", () => {
    expect(formatShortcut(parseShortcut("cmd+shift+b")!)).toBe("⌘⇧B");
    expect(formatShortcut(parseShortcut("alt+enter")!)).toBe("⌥↩");
  });
});
