// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComposerMoreButton, type ComposerMenuHost } from "./ComposerMoreButton";
import type { ComposerToolId } from "../composerTools";

let container: HTMLDivElement;
let root: Root;
// The host the last rendered "history" row was handed, so a test can play the
// row's own panel opening and closing.
let historyHost: ComposerMenuHost | null;

function renderRow(id: ComposerToolId, host: ComposerMenuHost) {
  if (id === "history") historyHost = host;
  return (
    <button type="button" data-row={id} onClick={host.close}>
      {id}
    </button>
  );
}

function render(props: Partial<Parameters<typeof ComposerMoreButton>[0]> = {}) {
  act(() => {
    root.render(
      <ComposerMoreButton
        tools={["history", "fork"]}
        isDefault
        renderRow={renderRow}
        onMove={props.onMove ?? vi.fn()}
        onReset={props.onReset ?? vi.fn()}
        {...props}
      />,
    );
  });
}

const trigger = () => container.querySelector<HTMLButtonElement>('button[aria-label="More"]')!;
const menu = () => document.body.querySelector('[role="menu"]');
const row = (id: string) => document.body.querySelector<HTMLButtonElement>(`[data-row="${id}"]`)!;

function open() {
  act(() => trigger().click());
}

function mouseDownOutside() {
  act(() => {
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
}

function pressEscape() {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  historyHost = null;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ComposerMoreButton", () => {
  it("opens the menu with the rows it holds and closes it on an outside click", () => {
    render();
    expect(menu()).toBeNull();
    open();
    expect(menu()).not.toBeNull();
    expect(row("history")).not.toBeNull();
    expect(row("fork")).not.toBeNull();
    mouseDownOutside();
    expect(menu()).toBeNull();
  });

  it("folds away when a plain row is picked", () => {
    render();
    open();
    act(() => row("fork").click());
    expect(menu()).toBeNull();
  });

  it("stays put behind a row's own panel and follows it down", () => {
    render();
    open();
    act(() => historyHost!.onOpenChange(true));
    mouseDownOutside();
    expect(menu()).not.toBeNull();
    pressEscape();
    expect(menu()).not.toBeNull();
    act(() => historyHost!.onOpenChange(false));
    expect(menu()).toBeNull();
  });

  it("closes on Escape when no row panel is up", () => {
    render();
    open();
    pressEscape();
    expect(menu()).toBeNull();
  });

  it("gives a row a button from its pin", () => {
    const onMove = vi.fn();
    render({ onMove });
    open();
    const pins = document.body.querySelectorAll<HTMLButtonElement>('[aria-label="Show as a button"]');
    expect(pins).toHaveLength(2);
    act(() => pins[1].click());
    expect(onMove).toHaveBeenCalledWith("fork");
    expect(menu()).toBeNull();
  });

  it("offers a reset only once the layout has been changed", () => {
    const onReset = vi.fn();
    render({ onReset, isDefault: true });
    open();
    expect(document.body.textContent).not.toContain("Reset to default");
    mouseDownOutside();
    render({ onReset, isDefault: false });
    open();
    const reset = Array.from(document.body.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Reset to default"),
    )!;
    act(() => reset.click());
    expect(onReset).toHaveBeenCalled();
    expect(menu()).toBeNull();
  });
});
