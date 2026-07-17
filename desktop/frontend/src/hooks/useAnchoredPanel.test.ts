// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { computeStyle } from "./useAnchoredPanel";

const VIEWPORT = { width: 1000, height: 800 };

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

function rect(r: { top: number; left: number; width: number; height: number }): DOMRect {
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
    right: r.left + r.width,
    bottom: r.top + r.height,
    x: r.left,
    y: r.top,
  } as DOMRect;
}

beforeEach(() => setViewport(VIEWPORT.width, VIEWPORT.height));

describe("computeStyle", () => {
  const trigger = rect({ top: 400, left: 500, width: 28, height: 28 });

  it("right-aligns to the trigger and opens below by default", () => {
    expect(computeStyle(trigger, 300, "below")).toEqual({
      position: "fixed",
      left: 528 - 300,
      width: 300,
      top: 436,
    });
  });

  it("anchors upward from the trigger's top edge", () => {
    expect(computeStyle(trigger, 300, "above")).toEqual({
      position: "fixed",
      left: 228,
      width: 300,
      bottom: 800 - 400 + 8,
    });
  });

  it("left-aligns to the trigger when asked", () => {
    expect(computeStyle(trigger, 300, "above", "left")).toMatchObject({ left: 500 });
  });

  it("clamps a panel that would overflow either viewport edge", () => {
    expect(computeStyle(rect({ top: 400, left: 10, width: 28, height: 28 }), 300, "above")).toMatchObject({
      left: 8,
    });
    expect(computeStyle(rect({ top: 400, left: 980, width: 28, height: 28 }), 300, "above", "left")).toMatchObject({
      left: 1000 - 8 - 300,
    });
  });

  it("adds no max height and never flips when flip is off", () => {
    const cramped = rect({ top: 20, left: 500, width: 28, height: 28 });
    const style = computeStyle(cramped, 300, "above");
    expect(style.maxHeight).toBeUndefined();
    expect(style.bottom).toBe(788);
    expect(style.top).toBeUndefined();
  });

  it("keeps the preferred side and caps it to the room there", () => {
    const style = computeStyle(trigger, 300, "above", "right", true);
    expect(style).toMatchObject({ bottom: 408, maxHeight: 400 - 8 - 8 });
    expect(style.top).toBeUndefined();
  });

  it("flips below when above is too cramped and below is roomier", () => {
    const high = rect({ top: 20, left: 500, width: 28, height: 28 });
    const style = computeStyle(high, 300, "above", "left", true);
    expect(style).toMatchObject({ top: 56, maxHeight: 800 - 48 - 8 - 8 });
    expect(style.bottom).toBeUndefined();
  });

  it("picks the roomier side when neither has usable room", () => {
    setViewport(1000, 300);
    // 104px above, 136px below: neither reaches the usable-room floor, so the
    // roomier side wins whichever side was preferred.
    const mid = rect({ top: 120, left: 500, width: 28, height: 28 });
    expect(computeStyle(mid, 300, "above", "right", true)).toMatchObject({ top: 156, maxHeight: 136 });
    expect(computeStyle(mid, 300, "below", "right", true)).toMatchObject({ top: 156, maxHeight: 136 });
  });

  it("keeps a cramped preferred side when it is the roomier one", () => {
    setViewport(1000, 300);
    // 136px above, 104px below — both cramped, but above still wins.
    const mid = rect({ top: 152, left: 500, width: 28, height: 28 });
    expect(computeStyle(mid, 300, "above", "right", true)).toMatchObject({ bottom: 156, maxHeight: 136 });
  });

  it("flips above when below is out of room", () => {
    const low = rect({ top: 760, left: 500, width: 28, height: 28 });
    const style = computeStyle(low, 300, "below", "right", true);
    expect(style).toMatchObject({ bottom: 48, maxHeight: 760 - 8 - 8 });
  });
});
