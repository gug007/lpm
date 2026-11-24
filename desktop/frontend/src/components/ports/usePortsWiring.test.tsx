// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./usePortsPolling", () => ({ usePortsPolling: () => {} }));
vi.mock("./usePortsFollowProjects", () => ({ usePortsFollowProjects: () => {} }));
vi.mock("../../store/app", async () => {
  const { create } = await import("zustand");
  return {
    useAppStore: create<{ view: string; setView: (view: string) => void }>((set) => ({
      view: "projects",
      setView: (view) => set({ view }),
    })),
  };
});

import { useActionShortcuts } from "../../hooks/useActionShortcuts";
import { useAppStore } from "../../store/app";
import { useSettingsStore } from "../../store/settings";
import type { ActionInfo } from "../../types";
import { usePortsWiring } from "./usePortsWiring";

let root: Root;

function Harness({ actions = [] }: { actions?: ActionInfo[] }) {
  useActionShortcuts(actions, run, true);
  usePortsWiring();
  return null;
}

const run = vi.fn();
const view = () => useAppStore.getState().view;

function press(key: string, modifiers: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { key, ...modifiers, bubbles: true, cancelable: true });
  act(() => {
    document.body.dispatchEvent(event);
  });
  return event;
}

function render(actions?: ActionInfo[]) {
  act(() => root.render(<Harness actions={actions} />));
}

beforeEach(() => {
  useSettingsStore.setState({ hotkeys: undefined });
  useAppStore.setState({ view: "projects" });
  run.mockClear();
  root = createRoot(document.createElement("div"));
});

afterEach(() => act(() => root.unmount()));

describe("the Ports key", () => {
  it("opens the ports with ⌘Y and goes back with it", () => {
    render();
    expect(press("y", { metaKey: true }).defaultPrevented).toBe(true);
    expect(view()).toBe("ports");
    press("y", { metaKey: true });
    expect(view()).toBe("projects");
  });

  it("leaves ⌃Y, ⇧⌘Y and its old ⌥⌘P alone", () => {
    render();
    press("y", { ctrlKey: true });
    press("y", { metaKey: true, shiftKey: true });
    press("p", { metaKey: true, altKey: true });
    expect(view()).toBe("projects");
  });

  it("stays with the action or the hotkey already on ⌘Y", () => {
    render([{ name: "deploy", cmd: "make deploy", shortcut: "cmd+y" } as ActionInfo]);
    press("y", { metaKey: true });
    expect(run).toHaveBeenCalledOnce();
    expect(view()).toBe("projects");

    render();
    useSettingsStore.setState({ hotkeys: { dictate: "cmd+y" } });
    expect(press("y", { metaKey: true }).defaultPrevented).toBe(false);
    expect(view()).toBe("projects");
  });
});
