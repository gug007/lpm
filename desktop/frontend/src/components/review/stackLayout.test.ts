import { describe, expect, it } from "vitest";
import { StackLayout } from "./stackLayout";

function stack(heights: number[]) {
  const layout = new StackLayout(100);
  layout.setRows(heights.map((_, i) => `f${i}`));
  heights.forEach((h, i) => layout.setHeight(`f${i}`, h));
  return layout;
}

describe("StackLayout", () => {
  it("places rows one after another and totals them", () => {
    const layout = stack([10, 20, 30]);
    expect([0, 1, 2, 3].map((i) => layout.top(i))).toEqual([0, 10, 30, 60]);
    expect(layout.total()).toBe(60);
  });

  it("finds the row under a position", () => {
    const layout = stack([10, 20, 30]);
    expect(layout.indexAt(0)).toBe(0);
    expect(layout.indexAt(9)).toBe(0);
    expect(layout.indexAt(10)).toBe(1);
    expect(layout.indexAt(59)).toBe(2);
    expect(layout.indexAt(1000)).toBe(2);
    expect(new StackLayout(100).indexAt(0)).toBe(-1);
  });

  it("returns the rows overlapping a window", () => {
    const layout = stack([10, 20, 30, 40]);
    expect(layout.range(0, 10)).toEqual([0, 0]);
    expect(layout.range(5, 35)).toEqual([0, 2]);
    expect(layout.range(30, 31)).toEqual([2, 2]);
    expect(layout.range(-50, 5)).toEqual([0, 0]);
    expect(layout.range(20, 20)).toBeNull();
  });

  it("reports the shift a height change causes and moves the rows below", () => {
    const layout = stack([10, 20, 30]);
    expect(layout.setHeight("f1", 25)).toBe(5);
    expect(layout.setHeight("f1", 25)).toBe(0);
    expect(layout.setHeight("missing", 25)).toBe(0);
    expect(layout.top(2)).toBe(35);
    expect(layout.total()).toBe(65);
  });

  it("keeps measured heights across a reorder and defaults new rows", () => {
    const layout = stack([10, 20, 30]);
    layout.setRows(["f2", "new", "f0"]);
    expect([0, 1, 2].map((i) => layout.height(i))).toEqual([30, 100, 10]);
    expect(layout.indexOf("f1")).toBe(-1);
    expect(layout.indexOf("new")).toBe(1);
    expect(layout.total()).toBe(140);
  });
});
