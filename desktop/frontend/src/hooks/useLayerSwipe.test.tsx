// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLayerSwipe } from "./useLayerSwipe";

let container: HTMLDivElement;
let root: Root;
let swipe: ReturnType<typeof useLayerSwipe>;
const onStep = vi.fn();
const canStep = vi.fn((_dir: 1 | -1) => true);

function Probe() {
  swipe = useLayerSwipe(onStep, canStep);
  return null;
}

function wheel(deltaX: number, deltaY = 0) {
  const event = { deltaX, deltaY, preventDefault: vi.fn() };
  swipe(event as unknown as Parameters<typeof swipe>[0]);
  return event.preventDefault;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  onStep.mockReset();
  canStep.mockReset();
  canStep.mockImplementation(() => true);
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root.render(<Probe />));
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe("useLayerSwipe", () => {
  it("leaves vertical scrolling alone", () => {
    expect(wheel(10, 40)).not.toHaveBeenCalled();
    expect(wheel(40, 40)).not.toHaveBeenCalled();
    expect(onStep).not.toHaveBeenCalled();
  });

  it("takes a sideways swipe and steps once it travels 30px", () => {
    expect(wheel(20)).toHaveBeenCalled();
    expect(onStep).not.toHaveBeenCalled();
    wheel(15);
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it("steps back on a swipe the other way", () => {
    wheel(-40);
    expect(onStep).toHaveBeenCalledWith(-1);
  });

  it("steps once per swipe, however long its momentum tail runs", () => {
    wheel(40);
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(100);
      expect(wheel(40)).toHaveBeenCalled();
    }
    expect(onStep).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(150);
    wheel(40);
    expect(onStep).toHaveBeenCalledTimes(2);
  });

  it("starts each swipe's travel afresh once the wheel goes quiet", () => {
    wheel(20);
    vi.advanceTimersByTime(150);
    wheel(15);
    expect(onStep).not.toHaveBeenCalled();
    wheel(15);
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it("lets the row scroll on a swipe past the first or last layer", () => {
    canStep.mockImplementation((dir) => dir === 1);
    expect(wheel(-40)).not.toHaveBeenCalled();
    expect(onStep).not.toHaveBeenCalled();
    expect(wheel(40)).toHaveBeenCalled();
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it("keeps the momentum tail of the step onto the last layer from scrolling the row", () => {
    wheel(40);
    canStep.mockImplementation(() => false);
    vi.advanceTimersByTime(100);
    expect(wheel(40)).toHaveBeenCalled();
  });
});
