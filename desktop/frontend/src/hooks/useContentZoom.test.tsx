// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContentZoom, ZOOM_MAX, ZOOM_MIN } from "./useContentZoom";

let container: HTMLDivElement;
let root: Root;
let latest: ReturnType<typeof useContentZoom>;

function Harness({ enabled, storageKey }: { enabled: boolean; storageKey?: string }) {
  latest = useContentZoom(enabled, storageKey);
  return null;
}

function mount(enabled = true, storageKey?: string) {
  act(() => root.render(<Harness enabled={enabled} storageKey={storageKey} />));
}

function press(key: string) {
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", { key, metaKey: true, bubbles: true, cancelable: true }),
  );
}

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useContentZoom", () => {
  it("steps in and out and resets", () => {
    mount();
    expect(latest.zoom).toBe(1);
    act(() => latest.zoomIn());
    expect(latest.zoom).toBe(1.1);
    act(() => latest.zoomOut());
    act(() => latest.zoomOut());
    expect(latest.zoom).toBe(0.9);
    act(() => latest.zoomReset());
    expect(latest.zoom).toBe(1);
  });

  it("clamps at both ends", () => {
    mount();
    for (let i = 0; i < 40; i++) act(() => latest.zoomIn());
    expect(latest.zoom).toBe(ZOOM_MAX);
    for (let i = 0; i < 40; i++) act(() => latest.zoomOut());
    expect(latest.zoom).toBe(ZOOM_MIN);
  });

  it("handles ⌘+ / ⌘- / ⌘0 and swallows them so app-wide zoom shortcuts stay out", () => {
    mount();
    const seen = vi.fn();
    window.addEventListener("keydown", seen);

    act(() => press("="));
    expect(latest.zoom).toBe(1.1);
    act(() => press("-"));
    expect(latest.zoom).toBe(1);
    act(() => press("+"));
    act(() => press("0"));
    expect(latest.zoom).toBe(1);
    expect(seen).not.toHaveBeenCalled();

    act(() => press("k"));
    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener("keydown", seen);
  });

  it("ignores the keys while disabled", () => {
    mount(false);
    act(() => press("="));
    expect(latest.zoom).toBe(1);
  });

  it("remembers the level under a storage key and restores it on the next mount", () => {
    mount(true, "lpm.test-zoom");
    act(() => latest.zoomIn());
    expect(localStorage.getItem("lpm.test-zoom")).toBe("1.1");

    act(() => root.unmount());
    root = createRoot(container);
    mount(true, "lpm.test-zoom");
    expect(latest.zoom).toBe(1.1);
  });

  it("starts at 1 when nothing is stored or the stored value is junk", () => {
    localStorage.setItem("lpm.test-zoom", "not-a-number");
    mount(true, "lpm.test-zoom");
    expect(latest.zoom).toBe(1);
  });

  it("zooms on ⌘-scroll over the attached surface", async () => {
    mount();
    const surface = document.createElement("div");
    document.body.appendChild(surface);
    act(() => latest.surfaceRef(surface));

    // happy-dom drops the modifier flags from the WheelEvent init dict, so the
    // pinch/⌘-scroll marker has to be pinned onto the event by hand.
    const wheel = new WheelEvent("wheel", { deltaY: -20, bubbles: true, cancelable: true });
    Object.defineProperty(wheel, "ctrlKey", { value: true });

    await act(async () => {
      surface.dispatchEvent(wheel);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(latest.zoom).toBe(1.2);
    surface.remove();
  });
});
