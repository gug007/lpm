// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

vi.mock("../bridge/commands", () => ({
  SetInterfaceSize: (size: number) => Promise.resolve(size),
}));
vi.mock("../bridge/runtime", () => ({ EventsOn: () => () => {} }));
const screen = vi.hoisted(() => ({ moveTo: (_scaleFactor: number) => {} }));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    scaleFactor: () => Promise.resolve(2),
    onScaleChanged: (changed: (event: { payload: { scaleFactor: number } }) => void) => {
      screen.moveTo = (scaleFactor) => changed({ payload: { scaleFactor } });
      return Promise.resolve(() => {});
    },
  }),
}));

import { applyInterfaceSize, initInterfaceSize } from "./interfaceSize";

describe("the pixel ratio the page reports", () => {
  it("follows the interface size and is the window's own again at 100%", async () => {
    // As WebKit has it: an accessor on the window itself.
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => 2 });
    initInterfaceSize();
    await applyInterfaceSize(1.1);
    expect(window.devicePixelRatio).toBeCloseTo(2.2);
    await applyInterfaceSize(1.25);
    expect(window.devicePixelRatio).toBeCloseTo(2.5);
    await applyInterfaceSize(1);
    expect(window.devicePixelRatio).toBe(2);
    await applyInterfaceSize(0.9);
    expect(window.devicePixelRatio).toBeCloseTo(1.8);
    screen.moveTo(1);
    expect(window.devicePixelRatio).toBeCloseTo(0.9);
    await applyInterfaceSize(1);
    expect(window.devicePixelRatio).toBe(2);
  });
});
