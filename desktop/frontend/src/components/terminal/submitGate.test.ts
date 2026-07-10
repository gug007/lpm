import { describe, expect, it } from "vitest";
import {
  PASTE_INLINE_MAX_CHARS,
  canGlueCr,
  canSkipQuietGate,
  crWasSwallowed,
} from "./submitGate";

describe("canGlueCr", () => {
  it("glues the CR only when bracketed paste is off", () => {
    // Bracketed on (an interactive TUI): the CR must be a separate write, or it's
    // read as pasted content and the body never submits.
    expect(canGlueCr("hi", true)).toBe(false);
    // Bracketed off (plain shell): no paste mode to fold the CR into.
    expect(canGlueCr("hi", false)).toBe(true);
  });

  it("never glues a body with an embedded newline (it needs bracketing)", () => {
    expect(canGlueCr("a\nb", false)).toBe(false);
    expect(canGlueCr("a\rb", false)).toBe(false);
    expect(canGlueCr("a\r\nb", true)).toBe(false);
  });

  it("glues a long single line when bracketed paste is off, regardless of length", () => {
    const long = "x".repeat(PASTE_INLINE_MAX_CHARS + 1);
    expect(canGlueCr(long, false)).toBe(true);
    expect(canGlueCr(long, true)).toBe(false);
  });
});

describe("canSkipQuietGate", () => {
  it("skips the pre-write quiet gate for a short single line whether or not bracketed paste is on", () => {
    expect(canSkipQuietGate("hi", true)).toBe(true);
    expect(canSkipQuietGate("hi", false)).toBe(true);
  });

  it("rejects any body containing a newline or carriage return", () => {
    expect(canSkipQuietGate("a\nb", false)).toBe(false);
    expect(canSkipQuietGate("a\r\nb", true)).toBe(false);
    expect(canSkipQuietGate("a\rb", false)).toBe(false);
  });

  it("gates a long single line under bracketed paste but not with it off", () => {
    const long = "x".repeat(PASTE_INLINE_MAX_CHARS + 1);
    // Bracketed on: Claude Code collapses it into a placeholder, so gate on quiet.
    expect(canSkipQuietGate(long, true)).toBe(false);
    // Bracketed off: no placeholder redraw, so no need to gate.
    expect(canSkipQuietGate(long, false)).toBe(true);
  });

  it("treats exactly the max length as short", () => {
    const atCap = "x".repeat(PASTE_INLINE_MAX_CHARS);
    expect(canSkipQuietGate(atCap, true)).toBe(true);
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
