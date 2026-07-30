// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "../store/settings";
import { SidebarActivityButton } from "./SidebarActivityButton";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  useSettingsStore.setState({ hotkeys: undefined });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SidebarActivityButton", () => {
  it("shows the shortcut and status while preserving click navigation", () => {
    const onToggle = vi.fn();
    act(() => {
      root.render(
        <SidebarActivityButton
          active={false}
          needsYou={2}
          hasError
          onToggle={onToggle}
        />,
      );
    });

    expect(container.textContent).toContain("Activity");
    expect(container.textContent).toContain("⌘⇧A");
    expect(container.textContent).toContain("2");

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    act(() => button!.click());
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
