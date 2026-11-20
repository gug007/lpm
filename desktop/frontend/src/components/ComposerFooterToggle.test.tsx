// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveSettings = vi.fn();
vi.mock("../store/settings", () => ({ saveSettings: (patch: unknown) => saveSettings(patch) }));

import { useComposerStore } from "../store/composer";
import { ComposerFooterToggle } from "./ComposerFooterToggle";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  saveSettings.mockClear();
  useComposerStore.setState({ open: false, active: {}, recent: {} });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = () => container.querySelector<HTMLButtonElement>('button[aria-label="Show message input"]');

function render() {
  act(() => root.render(<ComposerFooterToggle projectName="web" />));
}

describe("ComposerFooterToggle", () => {
  it("shows while the input is closed and a terminal is focused", () => {
    useComposerStore.setState({ open: false, active: { web: "t1" } });
    render();
    expect(button()).not.toBeNull();
    expect(button()?.title).toMatch(/^Show input \(/);
  });

  it("is gone while the input is open", () => {
    useComposerStore.setState({ open: true, active: { web: "t1" } });
    render();
    expect(button()).toBeNull();
  });

  it("is gone when the focused pane has no terminal", () => {
    useComposerStore.setState({ open: false, active: { web: null, other: "t2" } });
    render();
    expect(button()).toBeNull();
  });

  it("opens the input and then leaves the footer", () => {
    useComposerStore.setState({ open: false, active: { web: "t1" } });
    render();
    act(() => button()!.click());
    expect(useComposerStore.getState().open).toBe(true);
    expect(saveSettings).toHaveBeenCalledWith({ composerOpen: true });
    expect(button()).toBeNull();
  });
});
