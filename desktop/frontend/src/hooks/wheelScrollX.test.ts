import { describe, expect, it } from "vitest";
import { translateWheelToX } from "./wheelScrollX";

describe("translateWheelToX", () => {
  it("returns the vertical delta when it dominates", () => {
    expect(translateWheelToX({ deltaX: 2, deltaY: 40, deltaMode: 0, ctrlKey: false })).toBe(40);
  });

  it("returns null when horizontal motion dominates (native pan handles it)", () => {
    expect(
      translateWheelToX({ deltaX: 40, deltaY: 2, deltaMode: 0, ctrlKey: false }),
    ).toBeNull();
  });

  it("returns null when the axes are equal", () => {
    expect(
      translateWheelToX({ deltaX: 20, deltaY: 20, deltaMode: 0, ctrlKey: false }),
    ).toBeNull();
  });

  it("scales line-mode rows into pixels", () => {
    expect(translateWheelToX({ deltaX: 0, deltaY: 3, deltaMode: 1, ctrlKey: false })).toBe(48);
  });

  it("returns null for ctrl+wheel (trackpad pinch)", () => {
    expect(
      translateWheelToX({ deltaX: 0, deltaY: 40, deltaMode: 0, ctrlKey: true }),
    ).toBeNull();
  });

  it("preserves negative deltas", () => {
    expect(translateWheelToX({ deltaX: 0, deltaY: -30, deltaMode: 0, ctrlKey: false })).toBe(
      -30,
    );
  });
});
