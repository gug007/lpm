// @vitest-environment happy-dom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ projects: [], triggerRemoteTerminalOp: vi.fn() }));
const moveTab = vi.hoisted(() => vi.fn());
vi.mock("../store/app", () => ({ useAppStore: { getState: () => store } }));
vi.mock("../store/terminalTitles", () => ({ knownTabTitles: () => undefined }));
vi.mock("../tabMove", () => ({ moveDestinations: () => [{ name: "blog", label: "Blog" }], moveTab }));

import type { SidebarAgentRow } from "../sidebarAgents";
import { useAgentRowDrag } from "./useAgentRowDrag";

const AGENTS = ["a", "b", "c"].map((key) => ({ key, terminalId: key }) as SidebarAgentRow);
const ROW = 20;
const opened = vi.fn();
const archived = vi.fn();

function List() {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useAgentRowDrag("shop", AGENTS, ref);
  return (
    <div>
      <div ref={ref} data-list="" onPointerDownCapture={drag.onPointerDownCapture} onClickCapture={drag.onClickCapture}>
        {drag.dropLine !== null && <div data-drop-line="" />}
        {AGENTS.map((a) => (
          <div key={a.key}>
            <button data-agent-row={a.key} onClick={() => opened(a.key)} />
            <button data-archive={a.key} onClick={() => archived(a.key)} />
          </div>
        ))}
      </div>
      <div data-project-row="blog" />
      <div data-terminal="" />
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;
const find = (selector: string) => container.querySelector<HTMLElement>(selector)!;
const row = (key: string) => find(`[data-agent-row="${key}"]`);
const line = () => container.querySelector("[data-drop-line]");
const reordered = () => store.triggerRemoteTerminalOp.mock.calls.map((call) => call[4]);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<List />));
  AGENTS.forEach((a, i) => {
    row(a.key).getBoundingClientRect = () => new DOMRect(0, i * ROW, 100, ROW);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function pointer(type: string, on: EventTarget, y: number) {
  act(() => {
    on.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX: 50, clientY: y }));
  });
}

const middle = (key: string) => AGENTS.findIndex((a) => a.key === key) * ROW + ROW / 2;

function press(key: string) {
  pointer("pointerdown", row(key), middle(key));
}

function moveTo(over: Element, y: number) {
  document.elementFromPoint = () => over;
  pointer("pointermove", window, y);
}

const release = () => pointer("pointerup", window, 0);
const click = (el: HTMLElement) => act(() => el.click());

it("moves the tab to where the line shows", () => {
  press("a");
  moveTo(row("b"), middle("b") + 5);
  expect(line()).not.toBeNull();
  release();
  expect(reordered()).toEqual([["b", "a", "c"]]);
  expect(line()).toBeNull();
});

it("moves the tab last when dropped below the last line", () => {
  press("a");
  moveTo(row("c"), middle("c") + 5);
  release();
  expect(reordered()).toEqual([["b", "c", "a"]]);
});

it("does nothing when released off the list", () => {
  press("a");
  moveTo(find("[data-terminal]"), 300);
  expect(line()).toBeNull();
  release();
  expect(reordered()).toEqual([]);
});

it("forgets the line once the pointer leaves the list", () => {
  press("a");
  moveTo(row("c"), middle("c") + 5);
  moveTo(find("[data-terminal]"), 300);
  release();
  expect(reordered()).toEqual([]);
});

it("takes the line up again when the pointer comes back", () => {
  press("a");
  moveTo(find("[data-terminal]"), 300);
  moveTo(row("b"), middle("b") + 5);
  release();
  expect(reordered()).toEqual([["b", "a", "c"]]);
});

it("moves the tab to the project it is dropped on", () => {
  press("a");
  moveTo(row("b"), middle("b"));
  moveTo(find("[data-project-row]"), 100);
  release();
  expect(moveTab).toHaveBeenCalledWith("shop", "a", { name: "blog", label: "Blog" });
  expect(reordered()).toEqual([]);
});

it("moves nothing once the pointer has left the project it was over", () => {
  press("a");
  moveTo(find("[data-project-row]"), 100);
  moveTo(find("[data-terminal]"), 300);
  release();
  expect(moveTab).not.toHaveBeenCalled();
  expect(reordered()).toEqual([]);
});

it("swallows the click that ends a drag, and only that one", () => {
  press("a");
  moveTo(row("a"), middle("a") + 6);
  release();
  click(row("a"));
  expect(opened).not.toHaveBeenCalled();
  click(row("a"));
  expect(opened).toHaveBeenCalledWith("a");
});

it("lets the next click through when no click ended the drag", () => {
  press("a");
  moveTo(find("[data-terminal]"), 300);
  release();
  act(() => vi.advanceTimersByTime(0));
  click(find('[data-archive="b"]'));
  expect(archived).toHaveBeenCalledWith("b");
});

it("lets a press that came before the timer through", () => {
  press("a");
  moveTo(find("[data-terminal]"), 300);
  release();
  const archive = find('[data-archive="b"]');
  pointer("pointerdown", archive, middle("b"));
  click(archive);
  expect(archived).toHaveBeenCalledWith("b");
});

it("moves nothing and swallows nothing when the drag is cancelled", () => {
  press("a");
  moveTo(row("b"), middle("b") + 5);
  pointer("pointercancel", window, 0);
  click(find('[data-archive="b"]'));
  expect(reordered()).toEqual([]);
  expect(archived).toHaveBeenCalledWith("b");
});

it("opens a line that was pressed without being dragged", () => {
  press("a");
  moveTo(row("a"), middle("a") + 2);
  release();
  click(row("a"));
  expect(opened).toHaveBeenCalledWith("a");
  expect(reordered()).toEqual([]);
});
