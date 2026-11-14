// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toggle = vi.hoisted(() => vi.fn());
const shortcut = vi.hoisted(() => ({
  handler: null as ((event: KeyboardEvent) => void) | null,
}));
const field = vi.hoisted(() => ({ el: null as HTMLElement | null }));

const stub = vi.hoisted(() => () =>
  new Proxy(
    {},
    { has: () => true, get: (_t, prop) => (prop === "then" ? undefined : vi.fn(() => Promise.resolve(null))) },
  ));
vi.mock("../../../bridge/runtime", stub);
vi.mock("../../../bridge/commands", stub);
vi.mock("../../hooks/useKeyboardShortcut", () => ({
  useKeyboardShortcut: (_s: unknown, handler: (event: KeyboardEvent) => void) => {
    shortcut.handler = handler;
  },
}));
vi.mock("../../hooks/useDictateShortcut", () => ({
  useDictateShortcut: () => ({ shortcut: { key: "v", meta: true, alt: true }, label: "⌥⌘V" }),
}));
vi.mock("../../hooks/useVoiceDictation", () => ({
  DICTATION_AVAILABLE: true,
  useVoiceDictation: () => ({
    toggle,
    installOpen: false,
    setInstallOpen: vi.fn(),
    startAfterInstall: vi.fn(),
  }),
}));
vi.mock("../../dictation/shortcutTarget", () => ({ dictationShortcutField: () => field.el }));
vi.mock("../VoiceToTextInstallModal", () => ({ VoiceToTextInstallModal: () => null }));

import { DictationShortcut } from "./DictationShortcut";

let container: HTMLDivElement;
let root: Root;

const press = (repeat: boolean) =>
  act(() => shortcut.handler!(new KeyboardEvent("keydown", { key: "v", metaKey: true, altKey: true, repeat })));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  field.el = document.createElement("textarea");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<DictationShortcut />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("DictationShortcut", () => {
  it("starts once while the chord is held down", () => {
    press(false);
    press(true);
    press(true);

    expect(toggle).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveBeenCalledWith(field.el);
  });
});
