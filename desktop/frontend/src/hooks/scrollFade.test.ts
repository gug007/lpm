import { describe, expect, it } from "vitest";
import { computeScrollFade } from "./scrollFade";

describe("computeScrollFade", () => {
  it("shows no fades when content fits", () => {
    expect(computeScrollFade({ scrollLeft: 0, scrollWidth: 200, clientWidth: 200 })).toEqual({
      canScrollLeft: false,
      canScrollRight: false,
    });
  });

  it("shows only the right fade at the start of an overflowing strip", () => {
    expect(computeScrollFade({ scrollLeft: 0, scrollWidth: 400, clientWidth: 200 })).toEqual({
      canScrollLeft: false,
      canScrollRight: true,
    });
  });

  it("shows both fades in the middle", () => {
    expect(computeScrollFade({ scrollLeft: 100, scrollWidth: 400, clientWidth: 200 })).toEqual({
      canScrollLeft: true,
      canScrollRight: true,
    });
  });

  it("shows only the left fade at the end", () => {
    expect(computeScrollFade({ scrollLeft: 200, scrollWidth: 400, clientWidth: 200 })).toEqual({
      canScrollLeft: true,
      canScrollRight: false,
    });
  });

  it("ignores sub-pixel rounding via an epsilon", () => {
    expect(computeScrollFade({ scrollLeft: 0.5, scrollWidth: 400.4, clientWidth: 200 })).toEqual({
      canScrollLeft: false,
      canScrollRight: true,
    });
    expect(computeScrollFade({ scrollLeft: 199.6, scrollWidth: 400, clientWidth: 200 })).toEqual({
      canScrollLeft: true,
      canScrollRight: false,
    });
  });
});
