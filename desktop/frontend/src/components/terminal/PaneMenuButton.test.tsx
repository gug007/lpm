// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaneMenuButton } from "./PaneMenuButton";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const tooltip = () => document.querySelector('[role="tooltip"]');
const menuOpen = () =>
  Array.from(document.querySelectorAll("button")).some((b) => b.textContent?.includes("Open browser"));

describe("PaneMenuButton", () => {
  it("drops its tooltip while its menu is open", () => {
    act(() => {
      root.render(
        <PaneMenuButton
          actions={["review", "toolkit", "browser", "resume"]}
          isDefault
          onRun={vi.fn()}
          onMove={vi.fn()}
          onReset={vi.fn()}
        />,
      );
    });
    const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="More options"]')!;

    act(() => {
      trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(tooltip()?.textContent).toBe("More options");

    act(() => trigger.click());
    expect(menuOpen()).toBe(true);
    expect(tooltip()).toBeNull();

    act(() => {
      trigger.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(tooltip()).toBeNull();
  });
});
