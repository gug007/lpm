// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STATUS_RUNNING, type ProjectInfo } from "../types";

vi.hoisted(() => {
  window.__LPM_PLATFORM__ = "linux";
});

const bridge = vi.hoisted(() => ({
  quit: vi.fn(() => Promise.resolve()),
  check: vi.fn(() => Promise.resolve({ updateAvail: false })),
  emit: vi.fn(),
  projects: [] as ProjectInfo[],
}));

vi.mock("../../bridge/commands", () => ({
  QuitApp: bridge.quit,
  CheckForUpdate: bridge.check,
  GetVersion: () => Promise.resolve("1.2.3"),
}));
vi.mock("../../bridge/runtime", () => ({ EventsEmit: bridge.emit, EventsOn: () => () => {} }));
vi.mock("../notifications/toast", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock("../store/app", () => ({
  useAppStore: { getState: () => ({ projects: bridge.projects }) },
}));
vi.mock("../store/globalAgentStatus", () => ({
  useGlobalAgentStatus: { getState: () => ({ entries: [] }) },
}));

import { useQuitGuard } from "../quitGuard";
import { AppMenuButton } from "./AppMenuButton";

let host: HTMLDivElement;
let root: Root;
let onSettings: ReturnType<typeof vi.fn<() => void>>;
let onFeedback: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  onSettings = vi.fn<() => void>();
  onFeedback = vi.fn<() => void>();
  bridge.quit.mockClear();
  bridge.projects = [];
  useQuitGuard.setState({ asking: null, waiting: false });
  act(() => root.render(<AppMenuButton onSettings={onSettings} onFeedback={onFeedback} />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

function press(
  key: string,
  mods: { ctrl?: boolean; shift?: boolean; repeat?: boolean } = {},
  target: EventTarget = document.body,
) {
  const e = new KeyboardEvent("keydown", {
    key,
    ctrlKey: !!mods.ctrl,
    shiftKey: !!mods.shift,
    repeat: !!mods.repeat,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    target.dispatchEvent(e);
  });
  return e;
}

function working(name: string): ProjectInfo {
  return {
    name,
    session: name,
    root: `/Users/dev/${name}`,
    running: false,
    services: [],
    allServices: [],
    actions: [],
    profiles: [],
    activeProfile: "",
    statusEntries: [{ key: "claude_code_a", value: STATUS_RUNNING, priority: 0, timestamp: Date.now(), paneID: "%1" }],
    isRemote: false,
  };
}

const buttonByText = (text: string) =>
  Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes(text));

describe("AppMenuButton", () => {
  it("asks before Ctrl+Shift+Q quits, and a second Ctrl+Shift+Q confirms", () => {
    const e = press("Q", { ctrl: true, shift: true });
    expect(e.defaultPrevented).toBe(true);
    expect(document.body.textContent).toContain("Quit lpm?");
    expect(document.body.textContent).toContain("Press Ctrl+Shift+Q again to quit.");
    expect(bridge.quit).not.toHaveBeenCalled();
    press("Q", { ctrl: true, shift: true });
    expect(bridge.quit).toHaveBeenCalledTimes(1);
  });

  it("never confirms on a held key's auto-repeat", () => {
    press("Q", { ctrl: true, shift: true });
    const repeat = press("Q", { ctrl: true, shift: true, repeat: true });
    expect(repeat.defaultPrevented).toBe(true);
    expect(document.body.textContent).toContain("Quit lpm?");
    expect(bridge.quit).not.toHaveBeenCalled();
  });

  it("keeps Ctrl+Shift+Q away from a focused terminal", () => {
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    const seen = vi.fn();
    textarea.addEventListener("keydown", seen);
    press("Q", { ctrl: true, shift: true }, textarea);
    expect(seen).not.toHaveBeenCalled();
  });

  it("leaves plain Ctrl+Q to the terminal", () => {
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    const seen = vi.fn();
    textarea.addEventListener("keydown", seen);
    const e = press("q", { ctrl: true }, textarea);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(false);
    expect(document.body.textContent).not.toContain("Quit lpm?");
    expect(bridge.quit).not.toHaveBeenCalled();
  });

  it("opens Settings on Ctrl+,", () => {
    press(",", { ctrl: true });
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it("leaves other Ctrl keys alone", () => {
    const e = press("c", { ctrl: true });
    expect(e.defaultPrevented).toBe(false);
    expect(onSettings).not.toHaveBeenCalled();
  });

  it("quits straight from the menu entry", () => {
    act(() => document.querySelector<HTMLButtonElement>("button[aria-label='lpm menu']")?.click());
    const quit = buttonByText("Quit lpm");
    expect(quit).toBeTruthy();
    expect(quit!.textContent).toContain("Ctrl+Shift+Q");
    act(() => quit!.click());
    expect(bridge.quit).toHaveBeenCalledTimes(1);
  });

  it("lists agents mid-task instead of quitting, and a second Ctrl+Shift+Q quits anyway", () => {
    bridge.projects = [working("api")];
    press("Q", { ctrl: true, shift: true });
    expect(useQuitGuard.getState().asking).toEqual([{ key: "api", name: "api", count: 1, asking: 0 }]);
    expect(document.body.textContent).not.toContain("Quit lpm?");
    expect(bridge.quit).not.toHaveBeenCalled();
    press("Q", { ctrl: true, shift: true });
    expect(bridge.quit).toHaveBeenCalledTimes(1);
  });

  it("asks from the menu entry when agents are mid-task", () => {
    bridge.projects = [working("api")];
    act(() => document.querySelector<HTMLButtonElement>("button[aria-label='lpm menu']")?.click());
    act(() => buttonByText("Quit lpm")!.click());
    expect(useQuitGuard.getState().asking).not.toBeNull();
    expect(bridge.quit).not.toHaveBeenCalled();
  });

  it("routes Settings and feedback from the menu", () => {
    act(() => document.querySelector<HTMLButtonElement>("button[aria-label='lpm menu']")?.click());
    act(() => buttonByText("Settings")!.click());
    expect(onSettings).toHaveBeenCalledTimes(1);
    act(() => document.querySelector<HTMLButtonElement>("button[aria-label='lpm menu']")?.click());
    act(() => buttonByText("Help Improve lpm")!.click());
    expect(onFeedback).toHaveBeenCalledTimes(1);
  });

  it("keeps its tooltip off the open menu", () => {
    vi.useFakeTimers();
    try {
      const button = document.querySelector<HTMLButtonElement>("button[aria-label='lpm menu']")!;
      const tooltip = () => document.querySelector("[role=tooltip]")?.textContent ?? null;
      expect(button.hasAttribute("title")).toBe(false);

      act(() => {
        button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        vi.advanceTimersByTime(600);
      });
      expect(tooltip()).toBe("lpm menu");

      act(() => button.click());
      expect(buttonByText("Settings")).toBeTruthy();
      expect(tooltip()).toBeNull();

      act(() => {
        button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        vi.advanceTimersByTime(600);
      });
      expect(tooltip()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
