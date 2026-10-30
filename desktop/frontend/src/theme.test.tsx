// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const os = vi.hoisted(() => {
  const query = new EventTarget() as MediaQueryList & { matches: boolean };
  query.matches = false;
  window.matchMedia = () => query;
  return {
    query,
    switchTo(dark: boolean) {
      query.matches = dark;
      query.dispatchEvent(new Event("change"));
    },
  };
});

import { useSettingsStore } from "./store/settings";
import { applyTheme, useSystemThemeSync, type Theme } from "./theme";

let root: Root;

function Harness() {
  useSystemThemeSync();
  return null;
}

async function mountWith(theme: Theme) {
  useSettingsStore.setState({ theme });
  applyTheme(theme);
  await act(async () => root.render(<Harness />));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  os.query.matches = false;
  root = createRoot(document.createElement("div"));
});

afterEach(() => {
  act(() => root.unmount());
});

describe("useSystemThemeSync", () => {
  it("follows the OS appearance while the theme is system", async () => {
    await mountWith("system");
    expect(document.documentElement.dataset.theme).toBe("light");

    act(() => os.switchTo(true));
    expect(document.documentElement.dataset.theme).toBe("dark");

    act(() => os.switchTo(false));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("leaves a chosen theme alone when the OS switches", async () => {
    await mountWith("light");
    act(() => os.switchTo(true));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
