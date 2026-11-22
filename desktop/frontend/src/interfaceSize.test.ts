import { afterEach, describe, expect, it } from "vitest";
import { interfaceSizeLabel, interfaceSizeOf, steppedInterfaceSize } from "./interfaceSize";
import { toWindowPoints, useInterfaceZoom } from "./interfaceZoom";

describe("interface size", () => {
  afterEach(() => useInterfaceZoom.setState({ zoom: 1 }));

  it("reads unset or odd values as the nearest offered size", () => {
    expect(interfaceSizeOf(undefined)).toBe(1);
    expect(interfaceSizeOf("1.1")).toBe(1);
    expect(interfaceSizeOf(Number.NaN)).toBe(1);
    expect(interfaceSizeOf(1.1)).toBe(1.1);
    expect(interfaceSizeOf(1.2)).toBe(1.25);
    expect(interfaceSizeOf(0.5)).toBe(0.9);
    expect(interfaceSizeOf(3)).toBe(1.25);
  });

  it("steps one size at a time and stops at the ends", () => {
    expect(steppedInterfaceSize(1, 1)).toBe(1.1);
    expect(steppedInterfaceSize(1.1, 1)).toBe(1.25);
    expect(steppedInterfaceSize(1.25, 1)).toBe(1.25);
    expect(steppedInterfaceSize(1, -1)).toBe(0.9);
    expect(steppedInterfaceSize(0.9, -1)).toBe(0.9);
    expect(steppedInterfaceSize(1.25, 0)).toBe(1);
  });

  it("labels sizes as percentages", () => {
    expect(interfaceSizeLabel(0.9)).toBe("90%");
    expect(interfaceSizeLabel(1.25)).toBe("125%");
  });

  it("places native views in window points", () => {
    const rect = { x: 10, y: 20, width: 100, height: 40 };
    expect(toWindowPoints(rect)).toBe(rect);
    useInterfaceZoom.setState({ zoom: 1.25 });
    expect(toWindowPoints(rect)).toEqual({ x: 12.5, y: 25, width: 125, height: 50 });
  });
});
