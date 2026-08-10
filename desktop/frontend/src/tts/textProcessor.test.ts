import { describe, expect, it } from "vitest";
import { resumeOffset } from "./textProcessor";

describe("resumeOffset", () => {
  const text = "One sentence here. A second one follows! And a third?";

  it("starts at the beginning for the start of the text", () => {
    expect(resumeOffset(text, 0)).toBe(0);
    expect(resumeOffset(text, -1)).toBe(0);
  });

  it("rewinds to the start of the sentence being spoken", () => {
    const middle = text.indexOf("second") / text.length;
    expect(text.slice(resumeOffset(text, middle))).toBe(
      "A second one follows! And a third?",
    );
  });

  it("keeps the sentence's closing punctuation with the sentence before it", () => {
    const quoted = 'He said "stop." Then he left.';
    expect(quoted.slice(resumeOffset(quoted, 0.9))).toBe("Then he left.");
  });

  it("falls back to a word boundary when no sentence has ended", () => {
    const run = "a long clause with no terminator at all";
    expect(run.slice(resumeOffset(run, 0.5))).toBe("no terminator at all");
  });

  it("never splits a word", () => {
    for (let f = 0; f <= 1; f += 0.05) {
      const offset = resumeOffset(text, f);
      if (offset > 0) expect(text[offset - 1]).toMatch(/\s/);
    }
  });

  it("clamps past the end", () => {
    expect(resumeOffset(text, 2)).toBe(resumeOffset(text, 1));
    expect(resumeOffset("", 0.5)).toBe(0);
  });
});
