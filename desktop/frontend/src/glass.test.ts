import { describe, expect, it } from "vitest";
import { chromeBgAlpha, panelBgAlpha } from "./glass";

describe("chromeBgAlpha", () => {
  it("is most solid at level 0 and most glassy at 100", () => {
    expect(chromeBgAlpha(0)).toBeCloseTo(0.85, 5);
    expect(chromeBgAlpha(100)).toBeCloseTo(0.3, 5);
  });

  it("stays within the legible band and is monotonic", () => {
    let prev = chromeBgAlpha(0);
    for (let l = 10; l <= 100; l += 10) {
      const a = chromeBgAlpha(l);
      expect(a).toBeLessThanOrEqual(prev);
      expect(a).toBeGreaterThanOrEqual(0.3 - 1e-9);
      expect(a).toBeLessThanOrEqual(0.85);
      prev = a;
    }
  });

  it("clamps out-of-range input", () => {
    expect(chromeBgAlpha(-50)).toBeCloseTo(0.85, 5);
    expect(chromeBgAlpha(999)).toBeCloseTo(0.3, 5);
  });
});

describe("panelBgAlpha", () => {
  it("is opaque at 0 and floored at 100", () => {
    expect(panelBgAlpha(0)).toBe(1);
    expect(panelBgAlpha(100)).toBeCloseTo(0.4, 5);
  });
});
