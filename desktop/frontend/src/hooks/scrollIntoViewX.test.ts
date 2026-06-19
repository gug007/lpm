import { describe, expect, it } from "vitest";
import { computeScrollIntoViewLeft } from "./scrollIntoViewX";

const base = { scrollLeft: 0, clientWidth: 200, elementWidth: 40, margin: 8 };

describe("computeScrollIntoViewLeft", () => {
  it("returns null when the target is already comfortably visible", () => {
    expect(computeScrollIntoViewLeft({ ...base, elementLeft: 80 })).toBeNull();
  });

  it("scrolls left so a target before the viewport clears the margin", () => {
    expect(
      computeScrollIntoViewLeft({ ...base, scrollLeft: 100, elementLeft: 90 }),
    ).toBe(82);
  });

  it("scrolls right so a target past the viewport clears the margin", () => {
    expect(computeScrollIntoViewLeft({ ...base, elementLeft: 300 })).toBe(148);
  });

  it("treats a target hidden under the right fade as not visible", () => {
    expect(computeScrollIntoViewLeft({ ...base, elementLeft: 165 })).toBe(13);
  });

  it("never returns a negative scroll position", () => {
    expect(
      computeScrollIntoViewLeft({ ...base, scrollLeft: 5, elementLeft: 0 }),
    ).toBe(0);
  });
});
