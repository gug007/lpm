// @vitest-environment happy-dom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarAgentEdges } from "./SidebarAgentEdges";

let container: HTMLElement;
let root: Root;
let resized: ResizeObserverCallback[];

function List() {
  const ref = useRef<HTMLElement>(null);
  return (
    <div>
      <nav ref={ref}>
        <button data-edge-agent="working" />
      </nav>
      <SidebarAgentEdges listRef={ref} />
    </div>
  );
}

function place(el: Element, top: number, height = 30) {
  el.getBoundingClientRect = () => ({ top, bottom: top + height, height }) as DOMRect;
}

async function nextFrame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

/** Lays the list out at 100–400 with its one row at `rowTop`. */
async function mount(rowTop: number) {
  act(() => root.render(<List />));
  const list = container.querySelector("nav") as HTMLElement;
  const row = container.querySelector("button") as HTMLElement;
  place(list, 100, 300);
  place(row, rowTop);
  await nextFrame();
  return { list, row };
}

const line = (edge: string) => container.querySelector(`[data-edge="${edge}"]`);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  resized = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resized.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("SidebarAgentEdges", () => {
  it("lights the end an agent is past, in that agent's tone", async () => {
    await mount(10);
    expect(line("above")?.className).toContain("sidebar-edge-working");
    expect(line("below")).toBeNull();
  });

  it("follows the list as it scrolls", async () => {
    const { list, row } = await mount(200);
    expect(container.querySelector(".sidebar-edge")).toBeNull();

    place(row, 500);
    list.dispatchEvent(new Event("scroll"));
    await nextFrame();
    expect(line("below")?.className).toContain("sidebar-edge-working");

    place(row, 200);
    list.dispatchEvent(new Event("scroll"));
    await nextFrame();
    expect(container.querySelector(".sidebar-edge")).toBeNull();
  });

  it("notices a row changing state, and rows arriving, without a scroll", async () => {
    const { list, row } = await mount(10);

    await act(async () => {
      row.setAttribute("data-edge-agent", "error");
      await Promise.resolve();
    });
    await nextFrame();
    expect(line("above")?.className).toContain("sidebar-edge-error");

    const added = document.createElement("div");
    added.setAttribute("data-edge-agent", "needs-you");
    place(added, 600);
    await act(async () => {
      list.append(added);
      await Promise.resolve();
    });
    await nextFrame();
    expect(line("below")?.className).toContain("sidebar-edge-needs-you");
  });

  it("re-reads the list when it changes size", async () => {
    const { list } = await mount(350);
    expect(line("below")).toBeNull();

    place(list, 100, 200);
    resized[0]([], {} as ResizeObserver);
    await nextFrame();
    expect(line("below")).not.toBeNull();
  });

  it("stops measuring once it is gone", async () => {
    const { list } = await mount(200);
    const measured = vi.spyOn(list, "getBoundingClientRect");
    act(() => root.render(<nav />));
    list.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(measured).not.toHaveBeenCalled();
  });
});
