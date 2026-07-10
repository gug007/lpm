import { beforeEach, describe, expect, it, vi } from "vitest";

const transformText = vi.fn();
vi.mock("../bridge/commands", () => ({
  TransformText: (...args: unknown[]) => transformText(...args),
}));

import { clampVariantCount, generateVariants, MAX_VARIANTS, type TransformParams } from "./composerVariants";

const params: TransformParams = { cli: "claude", model: "", effort: "", fast: false };

// A rejected promise whose rejection is pre-handled, so vitest's promise-return
// result tracking doesn't surface it as an unhandled rejection.
function reject(message: string): Promise<string> {
  const p = Promise.reject(new Error(message));
  p.catch(() => {});
  return p;
}

describe("clampVariantCount", () => {
  it("floors at 1 and caps at MAX_VARIANTS", () => {
    expect(clampVariantCount(0)).toBe(1);
    expect(clampVariantCount(-3)).toBe(1);
    expect(clampVariantCount(999)).toBe(MAX_VARIANTS);
    expect(clampVariantCount(2.6)).toBe(3);
  });
});

describe("generateVariants", () => {
  beforeEach(() => transformText.mockReset());

  it("runs once with the bare instruction for a single result", async () => {
    transformText.mockResolvedValue("  rewritten  ");
    const out = await generateVariants(null, ".", params, "Improve", "hello", 1);
    expect(out).toEqual(["rewritten"]);
    expect(transformText).toHaveBeenCalledTimes(1);
    // count 1 must not carry the diversity nudge.
    expect(transformText.mock.calls[0][6]).toBe("Improve");
  });

  it("fans out N runs with distinct, diversity-nudged instructions", async () => {
    transformText.mockImplementation((...a: unknown[]) => Promise.resolve(`out:${a[6]}`));
    const out = await generateVariants(null, ".", params, "Improve", "hello", 3);
    expect(out).toHaveLength(3);
    expect(transformText).toHaveBeenCalledTimes(3);
    const instructions = transformText.mock.calls.map((c) => c[6] as string);
    instructions.forEach((ins) => expect(ins.startsWith("Improve")).toBe(true));
    expect(new Set(instructions).size).toBe(3); // each run's instruction differs
  });

  it("drops empty/whitespace results but keeps the rest", async () => {
    const replies = ["  keep ", "", "   ", "also"];
    let i = 0;
    transformText.mockImplementation(() => Promise.resolve(replies[i++]));
    const out = await generateVariants(null, ".", params, "Improve", "hello", 4);
    expect(out).toEqual(["keep", "also"]);
  });

  it("returns the successful runs even when some reject", async () => {
    const replies: Array<Promise<string>> = [
      Promise.resolve("good"),
      reject("boom"),
      Promise.resolve("great"),
    ];
    let i = 0;
    transformText.mockImplementation(() => replies[i++]);
    const out = await generateVariants(null, ".", params, "Improve", "hello", 3);
    expect(out).toEqual(["good", "great"]);
  });

  it("returns nothing when every run is empty", async () => {
    transformText.mockResolvedValue("   ");
    const out = await generateVariants(null, ".", params, "Improve", "hello", 3);
    expect(out).toEqual([]);
  });

  it("clamps an out-of-range count before fanning out", async () => {
    transformText.mockResolvedValue("x");
    await generateVariants(null, ".", params, "Improve", "hello", 99);
    expect(transformText).toHaveBeenCalledTimes(MAX_VARIANTS);
  });
});
