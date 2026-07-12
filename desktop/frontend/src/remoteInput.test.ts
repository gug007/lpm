import { describe, expect, it } from "vitest";
import { encodeTerminalInput } from "./remoteInput";

const NUL = String.fromCharCode(0);

describe("encodeTerminalInput", () => {
  it("passes UTF-8 text through unchanged", () => {
    expect(encodeTerminalInput("ls\r")).toBe("ls\r");
    expect(encodeTerminalInput("café")).toBe("café");
    expect(encodeTerminalInput("\x1b[A")).toBe("\x1b[A");
  });

  it("frames binary bytes as null + HEX: + hex", () => {
    // ESC (0x1b) + 0xff
    expect(encodeTerminalInput("\x1b\xff", true)).toBe(`${NUL}HEX:1bff`);
  });

  it("zero-pads and masks each byte", () => {
    expect(encodeTerminalInput("\x00\x09\x0a", true)).toBe(`${NUL}HEX:00090a`);
  });

  it("frames empty binary input to just the marker", () => {
    expect(encodeTerminalInput("", true)).toBe(`${NUL}HEX:`);
  });
});
