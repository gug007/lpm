// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../platform", () => ({
  platform: "linux",
  isMac: false,
  isLinux: true,
  isWindows: false,
}));

import { isBoundChord, useKeyboardShortcut } from "./useKeyboardShortcut";
import { terminalYieldsToApp } from "../components/terminal/terminalKeys";

let container: HTMLDivElement;
let root: Root;

function Harness({ onTab, enabled }: { onTab: () => void; enabled: boolean }) {
  useKeyboardShortcut({ key: "pagedown", meta: true, shift: false, alt: false }, onTab, enabled, true);
  return null;
}

function press(key: string, init: KeyboardEventInit) {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(e);
  return e;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useKeyboardShortcut on Linux", () => {
  it("fires on the physical chord and lets a focused terminal hand it over while bound", () => {
    const onTab = vi.fn();
    act(() => root.render(<Harness onTab={onTab} enabled />));

    press("PageDown", { ctrlKey: true });
    expect(onTab).toHaveBeenCalledTimes(1);
    press("PageDown", { metaKey: true });
    expect(onTab).toHaveBeenCalledTimes(1);

    const chord = new KeyboardEvent("keydown", { key: "PageDown", ctrlKey: true });
    expect(isBoundChord(chord)).toBe(true);
    expect(terminalYieldsToApp(chord)).toBe(true);

    act(() => root.render(<Harness onTab={onTab} enabled={false} />));
    expect(isBoundChord(chord)).toBe(false);
    expect(terminalYieldsToApp(chord)).toBe(false);
  });

  it("keeps Ctrl+Alt+letter with the terminal when only the plain ⌘ chord is bound", () => {
    const onClose = vi.fn();
    function CloseTab() {
      useKeyboardShortcut({ key: "w", meta: true }, onClose);
      return null;
    }
    act(() => root.render(<CloseTab />));

    const cmw = new KeyboardEvent("keydown", { key: "w", code: "KeyW", ctrlKey: true, altKey: true });
    expect(isBoundChord(cmw)).toBe(false);
    expect(terminalYieldsToApp(cmw)).toBe(false);
    press("w", { code: "KeyW", ctrlKey: true, altKey: true });
    expect(onClose).not.toHaveBeenCalled();

    press("W", { code: "KeyW", ctrlKey: true, shiftKey: true });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
