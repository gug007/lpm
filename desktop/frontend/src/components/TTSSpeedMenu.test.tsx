// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setSpeed = vi.fn();
const tts = { status: "playing" as string, setSpeed };
const settings = { ttsSpeed: 1.5 as number | undefined };

vi.mock("../store/settings", () => ({
  useSettingsStore: (select: (s: typeof settings) => unknown) => select(settings),
}));
vi.mock("../store/tts", () => ({
  useTTSStore: (select: (s: typeof tts) => unknown) => select(tts),
}));

const { TTSSpeedMenu } = await import("./TTSSpeedMenu");

let container: HTMLDivElement;
let root: Root;

function render() {
  act(() => {
    root.render(<TTSSpeedMenu className="trigger" />);
  });
}

function trigger(): HTMLButtonElement {
  return container.querySelector("button")!;
}

function slider(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="slider"]');
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function press(key: string) {
  act(() => {
    slider()!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  setSpeed.mockClear();
  tts.status = "playing";
  settings.ttsSpeed = 1.5;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("TTSSpeedMenu", () => {
  it("shows the current speed", () => {
    render();
    expect(trigger().textContent).toBe("1.5×");
  });

  it("falls back to 1x when no speed is stored", () => {
    settings.ttsSpeed = undefined;
    render();
    expect(trigger().textContent).toBe("1×");
  });

  it("opens a slider spanning 0.5x to 3x, set to the current speed", () => {
    render();
    click(trigger());
    expect(slider()!.getAttribute("aria-valuemin")).toBe("0.5");
    expect(slider()!.getAttribute("aria-valuemax")).toBe("3");
    expect(slider()!.getAttribute("aria-valuenow")).toBe("1.5");
  });

  it("nudges by a quarter step and commits once the keys settle", () => {
    render();
    click(trigger());
    press("ArrowRight");
    press("ArrowRight");
    expect(slider()!.getAttribute("aria-valuenow")).toBe("2");
    expect(setSpeed).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(500));
    expect(setSpeed).toHaveBeenCalledTimes(1);
    expect(setSpeed).toHaveBeenCalledWith(2);
  });

  it("stops at 3x", () => {
    render();
    click(trigger());
    for (let i = 0; i < 10; i++) press("ArrowRight");
    expect(slider()!.getAttribute("aria-valuenow")).toBe("3");
    act(() => void vi.advanceTimersByTime(500));
    expect(setSpeed).toHaveBeenCalledWith(3);
  });

  it("jumps to a labelled speed when its label is clicked", () => {
    render();
    click(trigger());
    const labels = [...document.querySelectorAll<HTMLButtonElement>("[data-flipped] button")];
    expect(labels.map((l) => l.textContent)).toEqual(["0.5×", "1×", "2×", "3×"]);
    click(labels.at(-1)!);
    expect(setSpeed).toHaveBeenCalledWith(3);
  });

  it("closes on Escape without committing", () => {
    render();
    click(trigger());
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(slider()).toBeNull();
    expect(setSpeed).not.toHaveBeenCalled();
  });

  it("marks the trigger while the engine is catching up", () => {
    render();
    expect(trigger().className).not.toContain("speed-applying");
    act(() => root.unmount());
    tts.status = "loading";
    root = createRoot(container);
    render();
    expect(trigger().className).toContain("speed-applying");
  });
});
