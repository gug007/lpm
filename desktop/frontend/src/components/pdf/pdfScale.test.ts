import { describe, expect, it } from "vitest";
import { PDF_TO_CSS, fitScale, outputScale } from "./pdfScale";

describe("fitScale", () => {
  it("fits a page to the width it is given", () => {
    expect(fitScale(612, 600)).toBeCloseTo(600 / 612);
  });

  it("stops a quarter past printed size in a wide window", () => {
    expect(fitScale(612, 3000)).toBeCloseTo(PDF_TO_CSS * 1.25);
  });

  it("draws at printed size until the width is known", () => {
    expect(fitScale(612, 0)).toBe(PDF_TO_CSS);
    expect(fitScale(0, 800)).toBe(PDF_TO_CSS);
  });
});

describe("outputScale", () => {
  it("draws at the screen's density", () => {
    expect(outputScale(800, 1000, 2)).toBe(2);
    expect(outputScale(800, 1000, 0)).toBe(1);
  });

  it("keeps a Letter page sharp at the top zoom", () => {
    expect(outputScale(2549, 3299, 2)).toBeCloseTo(2, 2);
  });

  it("lowers the density for a page too large to hold at full density", () => {
    const s = outputScale(2549, 60000, 2);
    expect(s).toBeLessThan(2);
    expect(2549 * s * 60000 * s).toBeLessThanOrEqual(2 ** 25 + 1);
  });
});
