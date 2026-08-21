import { describe, expect, it } from "vitest";
import {
  base64ByteLength,
  fitScale,
  formatImageMeta,
  scaledSize,
  zoomPercent,
} from "./imageFit";

describe("fitScale", () => {
  it("returns 1 without a natural size", () => {
    expect(fitScale(null, { w: 100, h: 100 })).toBe(1);
  });

  it("returns 1 without a box", () => {
    expect(fitScale({ w: 100, h: 100 }, null)).toBe(1);
  });

  it("returns 1 for a zero-sized box", () => {
    expect(fitScale({ w: 100, h: 100 }, { w: 0, h: 0 })).toBe(1);
  });

  it("returns 1 for a zero-sized image", () => {
    expect(fitScale({ w: 0, h: 10 }, { w: 800, h: 600 })).toBe(1);
  });

  it("never upscales an image smaller than the box", () => {
    expect(fitScale({ w: 64, h: 64 }, { w: 800, h: 600 })).toBe(1);
  });

  it("fits a width-bound image", () => {
    expect(fitScale({ w: 1600, h: 400 }, { w: 800, h: 600 })).toBe(0.5);
  });

  it("fits a height-bound image", () => {
    expect(fitScale({ w: 400, h: 1200 }, { w: 800, h: 600 })).toBe(0.5);
  });

  it("takes the smaller ratio when both axes bind", () => {
    expect(fitScale({ w: 2000, h: 1000 }, { w: 800, h: 200 })).toBe(0.2);
  });
});

describe("scaledSize", () => {
  it("rounds both axes", () => {
    expect(scaledSize({ w: 1001, h: 751 }, 0.5)).toEqual({ w: 501, h: 376 });
  });

  it("is identity at scale 1", () => {
    expect(scaledSize({ w: 100, h: 100 }, 1)).toEqual({ w: 100, h: 100 });
  });
});

describe("zoomPercent", () => {
  it("reads 100 at fit 1 and zoom 1", () => {
    expect(zoomPercent(1, 1)).toBe(100);
  });

  it("rounds the effective scale", () => {
    expect(zoomPercent(0.4567, 1)).toBe(46);
  });

  it("multiplies fit by zoom", () => {
    expect(zoomPercent(0.5, 2.5)).toBe(125);
  });

  it("handles zoom below 1", () => {
    expect(zoomPercent(1, 0.6)).toBe(60);
  });
});

describe("base64ByteLength", () => {
  it("is 0 for an empty payload", () => {
    expect(base64ByteLength("")).toBe(0);
  });

  it("counts an unpadded payload", () => {
    expect(base64ByteLength("QUJD")).toBe(3);
  });

  it("counts a two-char padded payload", () => {
    expect(base64ByteLength("QQ==")).toBe(1);
  });

  it("counts a padded four-byte payload", () => {
    expect(base64ByteLength("QUJDRA==")).toBe(4);
  });

  it("handles a megabyte-scale payload", () => {
    const data = "A".repeat(1_398_100);
    expect(base64ByteLength(data)).toBe(Math.floor((data.length * 3) / 4));
  });
});

describe("formatImageMeta", () => {
  it("joins dimensions and size", () => {
    expect(formatImageMeta({ w: 2048, h: 1536 }, "412 KB")).toBe(
      "2048 × 1536 · 412 KB",
    );
  });

  it("shows dimensions alone", () => {
    expect(formatImageMeta({ w: 2048, h: 1536 }, "")).toBe("2048 × 1536");
  });

  it("shows size alone", () => {
    expect(formatImageMeta(null, "412 KB")).toBe("412 KB");
  });

  it("is null with nothing to show", () => {
    expect(formatImageMeta(null, "")).toBeNull();
  });
});
