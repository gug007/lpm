// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";
import { ComposerVideoButton } from "./ComposerVideoButton";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

function render(props: Partial<Parameters<typeof ComposerVideoButton>[0]> = {}) {
  act(() =>
    root.render(<ComposerVideoButton on={false} onToggle={() => {}} offReason={null} agent="claude" {...props} />),
  );
}

function hover(): string {
  const trigger = host.querySelector("button")!.parentElement!;
  act(() => {
    trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
  });
  act(() => {
    vi.advanceTimersByTime(COMPOSER_TOOLTIP_DELAY_MS);
  });
  return document.querySelector('[role="tooltip"]')?.textContent ?? "";
}

describe("ComposerVideoButton tooltip", () => {
  it("shows a question and the video reply it gets, with the agent's mark", () => {
    render();
    const text = hover();
    expect(text).toContain("How does checkout apply a coupon?");
    expect(text).toContain("chapters · captions");
    expect(text).toContain("Ask as usual. The reply is a narrated video.");
    expect(document.querySelector('[role="tooltip"] [data-agent="claude"]')).not.toBeNull();
  });

  it("says how to go back once it is on", () => {
    render({ on: true });
    expect(hover()).toBe("Back to a text answer");
  });

  it("says why where it can't be used", () => {
    render({ offReason: "Videos record on a Mac" });
    expect(hover()).toBe("Videos record on a Mac");
  });
});

describe("ComposerVideoButton off a Mac", () => {
  it("does nothing on a click", () => {
    const onToggle = vi.fn();
    render({ offReason: "Videos record on a Mac", onToggle });
    act(() => host.querySelector("button")!.click());
    expect(onToggle).not.toHaveBeenCalled();
  });
});
