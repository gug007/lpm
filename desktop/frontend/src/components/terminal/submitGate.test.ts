import { describe, expect, it } from "vitest";
import {
  PASTE_ONE_SHOT_MAX_CHARS,
  canOneShotSubmit,
  crWasSwallowed,
} from "./submitGate";

describe("canOneShotSubmit", () => {
  it("allows a short single line whether or not bracketed paste is on", () => {
    expect(canOneShotSubmit("hi", true)).toBe(true);
    expect(canOneShotSubmit("hi", false)).toBe(true);
  });

  it("rejects any body containing a newline or carriage return", () => {
    expect(canOneShotSubmit("a\nb", false)).toBe(false);
    expect(canOneShotSubmit("a\r\nb", true)).toBe(false);
    expect(canOneShotSubmit("a\rb", false)).toBe(false);
  });

  it("sends a long single line in one write only when bracketed paste is off", () => {
    const long = "x".repeat(PASTE_ONE_SHOT_MAX_CHARS + 1);
    // Bracketed on: Claude Code would collapse it and swallow the folded CR.
    expect(canOneShotSubmit(long, true)).toBe(false);
    // Bracketed off: no placeholder redraw, so the CR is safe inline.
    expect(canOneShotSubmit(long, false)).toBe(true);
  });

  it("treats exactly the max length as short", () => {
    const atCap = "x".repeat(PASTE_ONE_SHOT_MAX_CHARS);
    expect(canOneShotSubmit(atCap, true)).toBe(true);
  });
});

describe("crWasSwallowed", () => {
  it("reports swallowed when no output followed the CR", () => {
    expect(crWasSwallowed(900, 1000)).toBe(true);
  });

  it("reports not swallowed when output arrived at or after the CR", () => {
    expect(crWasSwallowed(1000, 1000)).toBe(false);
    expect(crWasSwallowed(1200, 1000)).toBe(false);
  });
});
