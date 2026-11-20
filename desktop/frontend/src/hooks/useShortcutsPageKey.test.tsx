// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../bridge/runtime", () => ({ EventsOn: () => () => {} }));
vi.mock("../platform", async (orig) => ({ ...(await orig<typeof import("../platform")>()), isMac: true }));

import { useAppStore } from "../store/app";
import { useSettingsReturn } from "../store/settingsReturn";
import { useShortcutsPageKey } from "./useShortcutsPageKey";

function Probe() {
  useShortcutsPageKey();
  return null;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Probe />));
  useAppStore.setState({ view: "projects", settingsTab: "general" });
  useSettingsReturn.setState({ from: "projects" });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function press(target: EventTarget = window, mods: Partial<KeyboardEventInit> = { metaKey: true }) {
  const event = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true, ...mods });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe("useShortcutsPageKey", () => {
  it("opens Settings at Shortcuts, and goes back on a second press", () => {
    press();
    expect(useAppStore.getState().view).toBe("settings");
    expect(useAppStore.getState().settingsTab).toBe("shortcuts");
    useSettingsReturn.setState({ from: "terminals" });
    press();
    expect(useAppStore.getState().view).toBe("terminals");
  });

  it("opens Shortcuts from another Settings page instead of leaving", () => {
    useAppStore.setState({ view: "settings", settingsTab: "agents" });
    press();
    expect(useAppStore.getState().view).toBe("settings");
    expect(useAppStore.getState().settingsTab).toBe("shortcuts");
  });

  it("leaves ⌘/ to the file editor", () => {
    const editor = document.createElement("div");
    editor.className = "monaco-editor";
    const field = document.createElement("textarea");
    editor.appendChild(field);
    document.body.appendChild(editor);
    const event = press(field);
    expect(useAppStore.getState().view).toBe("projects");
    expect(event.defaultPrevented).toBe(false);
    editor.remove();
  });

  it("works on layouts that type / with Shift", () => {
    press(window, { metaKey: true, shiftKey: true });
    expect(useAppStore.getState().settingsTab).toBe("shortcuts");
  });

  it("leaves ⌃/ to the terminal on macOS", () => {
    press(window, { ctrlKey: true });
    expect(useAppStore.getState().view).toBe("projects");
  });
});
