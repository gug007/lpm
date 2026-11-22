// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextMenuShell } from "./ContextMenuShell";

let container: HTMLDivElement;
let root: Root;
let scroller: HTMLDivElement;
let anchor: HTMLButtonElement;
let anchorTop: number;
const onClose = vi.fn();

const rect = (top: number, height: number) => new DOMRect(400, top, 28, height);

const render = (placement: { anchor: HTMLElement } | { x: number; y: number }) =>
  act(() => {
    root.render(
      <ContextMenuShell {...placement} align="end" onClose={onClose}>
        <button type="button">Rename</button>
      </ContextMenuShell>,
    );
  });

const menu = () => container.querySelector<HTMLElement>("[data-context-menu]");

const scrollTo = (top: number, target: EventTarget = scroller) =>
  act(() => {
    anchorTop = top;
    target.dispatchEvent(new Event("scroll"));
  });

beforeEach(() => {
  container = document.createElement("div");
  scroller = document.createElement("div");
  anchor = document.createElement("button");
  scroller.appendChild(anchor);
  document.body.append(scroller, container);
  anchorTop = 300;
  scroller.getBoundingClientRect = () => rect(100, 400);
  anchor.getBoundingClientRect = () => rect(anchorTop, 28);
  root = createRoot(container);
  onClose.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  scroller.remove();
});

describe("ContextMenuShell anchor", () => {
  it("moves with its anchor as the page scrolls", () => {
    render({ anchor });
    expect(menu()!.style.top).toBe("332px");
    scrollTo(180);
    expect(menu()!.style.top).toBe("212px");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes once the anchor scrolls out of view", () => {
    render({ anchor });
    scrollTo(60);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("ignores scrolling elsewhere", () => {
    render({ anchor });
    scrollTo(60, container);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("opens beside its anchor, top edges level, when asked to its right", () => {
    act(() => {
      root.render(
        <ContextMenuShell anchor={anchor} side="right" align="end" onClose={onClose}>
          <button type="button">Rename</button>
        </ContextMenuShell>,
      );
    });
    expect(menu()!.style.left).toBe("432px");
    expect(menu()!.style.top).toBe("300px");
  });

  it("stays put without an anchor", () => {
    render({ x: 428, y: 332 });
    scrollTo(60);
    expect(menu()!.style.top).toBe("332px");
    expect(onClose).not.toHaveBeenCalled();
  });
});
