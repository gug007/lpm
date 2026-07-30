// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "../store/settings";
import { useAgentOverviewShortcut } from "./useAgentOverviewShortcut";

let container: HTMLDivElement;
let root: Root;

function Harness({ onToggle }: { onToggle: () => void }) {
  const shortcut = useAgentOverviewShortcut(onToggle);
  return <span>{shortcut}</span>;
}

function press(
  target: Element,
  key: string,
  modifiers: { metaKey?: boolean; shiftKey?: boolean; altKey?: boolean },
) {
  const event = new KeyboardEvent("keydown", {
    key,
    ...modifiers,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

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

describe("useAgentOverviewShortcut", () => {
  it("opens with the default shortcut from a text scope", () => {
    const onToggle = vi.fn();
    act(() => root.render(<Harness onToggle={onToggle} />));

    const field = document.createElement("div");
    field.setAttribute("data-text-scope", "");
    document.body.appendChild(field);

    const event = press(field, "a", { metaKey: true, shiftKey: true });

    expect(onToggle).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    expect(container.textContent).toBe("⌘⇧A");

    press(document.body, "a", { metaKey: true, shiftKey: true });
    expect(onToggle).toHaveBeenCalledTimes(2);
    field.remove();
  });

  it("stands down while a modal is open", () => {
    const onToggle = vi.fn();
    act(() => root.render(<Harness onToggle={onToggle} />));

    const modal = document.createElement("div");
    modal.setAttribute("data-modal-overlay", "");
    document.body.appendChild(modal);

    const event = press(modal, "a", { metaKey: true, shiftKey: true });

    expect(onToggle).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    modal.remove();
  });

  it("tracks a customized shortcut", () => {
    const onToggle = vi.fn();
    act(() => {
      useSettingsStore.setState({
        hotkeys: { toggleAgentOverview: "cmd+alt+g" },
      });
      root.render(<Harness onToggle={onToggle} />);
    });

    press(document.body, "a", { metaKey: true, shiftKey: true });
    press(document.body, "g", { metaKey: true, altKey: true });

    expect(onToggle).toHaveBeenCalledOnce();
    expect(container.textContent).toBe("⌘⌥G");
  });
});
