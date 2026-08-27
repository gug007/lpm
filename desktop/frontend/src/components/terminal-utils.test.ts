import { describe, expect, it, vi } from "vitest";

vi.mock("../../bridge/runtime", () => ({ BrowserOpenURL: vi.fn() }));

import { TERMINAL_FONT_FAMILY, terminalFontStack } from "./terminal-utils";

describe("terminalFontStack", () => {
  it("falls back to the default stack when no family is set", () => {
    expect(terminalFontStack()).toBe(TERMINAL_FONT_FAMILY);
    expect(terminalFontStack("")).toBe(TERMINAL_FONT_FAMILY);
    expect(terminalFontStack("   ")).toBe(TERMINAL_FONT_FAMILY);
  });

  it("quotes a custom family and keeps the default stack behind it", () => {
    expect(terminalFontStack("JetBrains Mono")).toBe(
      `'JetBrains Mono', ${TERMINAL_FONT_FAMILY}`,
    );
  });

  it("trims surrounding whitespace from the family", () => {
    expect(terminalFontStack("  Hack  ")).toBe(`'Hack', ${TERMINAL_FONT_FAMILY}`);
  });

  it("strips single quotes so the family can't break out of its quoting", () => {
    expect(terminalFontStack("'Fira Code'")).toBe(
      `'Fira Code', ${TERMINAL_FONT_FAMILY}`,
    );
    expect(terminalFontStack("Mono', monospace; x")).toBe(
      `'Mono, monospace; x', ${TERMINAL_FONT_FAMILY}`,
    );
  });
});
