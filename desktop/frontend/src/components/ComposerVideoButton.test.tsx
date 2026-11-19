// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";
import { useSettingsStore } from "../store/settings";
import { useVideoSettings } from "../store/videoSettings";
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
  useVideoSettings.setState({ open: false });
  useSettingsStore.setState({ videoNarrator: undefined, videoCloudVoice: undefined });
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
  return card()?.textContent ?? "";
}

// The card is portaled to the body; the preview takes the pointer, so it has no
// tooltip role.
const card = () => document.querySelector(".tooltip-in");

describe("ComposerVideoButton tooltip", () => {
  it("shows a question and the video reply it gets, with the agent's mark", () => {
    render();
    const text = hover();
    expect(text).toContain("How does checkout apply a coupon?");
    expect(text).toContain("chapters · captions");
    expect(text).toContain("Ask as usual. The reply is a narrated video.");
    expect(card()?.querySelector('[data-agent="claude"]')).not.toBeNull();
  });

  it("ends on the voice on this Mac, free, by default", () => {
    render();
    expect(hover()).toContain("Voiced on this Mac · free");
  });

  it("names the cloud voice and its price once it is picked", () => {
    useSettingsStore.setState({ videoNarrator: "openai", videoCloudVoice: "cedar" });
    render();
    expect(hover()).toContain("OpenAI voice, cedar · ≈ 2¢ a minute");
  });

  it("opens Video settings from the card", () => {
    render();
    hover();
    const settings = [...card()!.querySelectorAll("button")].find((b) => b.textContent === "Settings")!;
    act(() => settings.click());
    expect(useVideoSettings.getState().open).toBe(true);
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
