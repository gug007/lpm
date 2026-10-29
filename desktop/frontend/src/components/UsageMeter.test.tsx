// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UsageMeter } from "./UsageMeter";
import { WEEKLY_MS } from "./stats/limitsFormat";

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderMeter(usedPercent: number, resetsInHours: number) {
  act(() =>
    root.render(
      <UsageMeter
        label="Weekly"
        win={{ usedPercent, resetsAt: Math.floor(NOW / 1000) + resetsInHours * HOUR }}
        windowMs={WEEKLY_MS}
        now={NOW}
        stale={false}
      />,
    ),
  );
  return container.querySelector<HTMLElement>('[role="meter"] > [aria-hidden="true"]');
}

describe("UsageMeter pace tick", () => {
  it("marks elapsed time even before a pace verdict can be given", () => {
    const tick = renderMeter(23, 160);
    expect(tick).not.toBeNull();
    expect(parseFloat(tick!.style.left)).toBeCloseTo((8 / 168) * 100);
    expect(container.textContent).not.toContain("pace");
  });

  it("marks elapsed time once the window is judged", () => {
    const tick = renderMeter(3, 122);
    expect(parseFloat(tick!.style.left)).toBeCloseTo((46 / 168) * 100);
    expect(container.textContent).toContain("will last");
  });
});

describe("UsageMeter reset reminder", () => {
  function renderWithReminder(set: boolean, onToggle: () => void) {
    act(() =>
      root.render(
        <UsageMeter
          label="5-hour"
          win={{ usedPercent: 100, resetsAt: Math.floor(NOW / 1000) + 2 * HOUR }}
          windowMs={WEEKLY_MS}
          now={NOW}
          stale={false}
          reminder={{ set, onToggle }}
        />,
      ),
    );
    return container.querySelector<HTMLButtonElement>('button[aria-label^="Remind me"]');
  }

  it("toggles the reminder from the bell", () => {
    let toggled = 0;
    const bell = renderWithReminder(false, () => toggled++);
    expect(bell?.getAttribute("aria-pressed")).toBe("false");
    expect(bell?.getAttribute("aria-label")).toBe("Remind me when the 5-hour limit resets");
    act(() => bell!.click());
    expect(toggled).toBe(1);
    expect(container.textContent).not.toContain("reminder set");
  });

  it("says when a reminder is set", () => {
    const bell = renderWithReminder(true, () => {});
    expect(bell?.getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain("reminder set");
  });

  it("shows no bell without a reminder to offer", () => {
    renderMeter(100, 2);
    expect(container.querySelector('button[aria-label^="Remind me"]')).toBeNull();
  });
});
