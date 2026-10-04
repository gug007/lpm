// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZoneLayerView } from "../actionsLayoutModel";
import type { ZoneDisplay } from "../types";
import { ZoneDots } from "./ZoneDots";
import type { ZoneFrameState } from "./ZoneFrame";

const layer = (name: string, label?: string): ZoneLayerView => ({
  key: `ship/${name}`,
  layer: { name, label },
  ids: [],
  actions: [],
});

let container: HTMLDivElement;
let root: Root;
const onOpen = vi.fn();

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  onOpen.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function render(
  layers: ZoneLayerView[],
  openKey: string,
  dragging = false,
  display: ZoneDisplay = "header",
  frameState: ZoneFrameState = "filled",
) {
  act(() =>
    root.render(
      <ZoneDots
        zone="ship"
        layers={layers}
        openKey={openKey}
        dragging={dragging}
        display={display}
        frameState={frameState}
        onOpen={onOpen}
      />,
    ),
  );
  const dots = [...container.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];
  const label = container.querySelector<HTMLButtonElement>("button:not([aria-pressed])");
  return { dots, label, pill: container.firstElementChild as HTMLElement | null };
}

const enter = (el: Element) => el.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
const leave = (el: Element) =>
  el.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body }));

describe("ZoneDots", () => {
  it("shows nothing for a zone with fewer than two layers", () => {
    expect(render([], "ship").pill).toBeNull();
    expect(render([layer("a")], "ship/a").pill).toBeNull();
  });

  it("shows one dot per layer, named by its label or its number", () => {
    const { dots } = render([layer("a", "Dev"), layer("b")], "ship/a");
    expect(dots.map((dot) => dot.getAttribute("aria-label"))).toEqual(["Dev", "Layer 2"]);
    expect(dots.map((dot) => dot.title)).toEqual(["Dev", "Layer 2"]);
    expect(dots.map((dot) => dot.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
  });

  it("names the open layer once any layer has a label", () => {
    expect(render([layer("a"), layer("b")], "ship/a").label).toBeNull();
    const { label } = render([layer("a", "Dev"), layer("b", "Production")], "ship/a");
    expect(label).not.toBeNull();
    const visible = (el: HTMLElement) =>
      [...el.querySelectorAll("span")].filter((span) => !span.className.includes("invisible")).map((s) => s.textContent);
    expect(visible(label!)).toEqual(["Dev"]);
    expect(label!.getAttribute("aria-label")).toBe("Dev, next layer");
    // Every name sits in the label, so it's as wide as the widest one.
    expect(label!.textContent).toContain("Production");
    const unnamed = render([layer("a", "Dev"), layer("b")], "ship/b").label!;
    expect(visible(unnamed)).toEqual(["Layer 2"]);
    expect(unnamed.getAttribute("aria-label")).toBe("Layer 2, next layer");
  });

  it("opens the layer whose dot is clicked", () => {
    const { dots } = render([layer("a"), layer("b"), layer("c")], "ship/a");
    act(() => dots[2].click());
    expect(onOpen).toHaveBeenCalledWith("ship/c");
  });

  it("opens the next layer from the label, wrapping past the last", () => {
    const layers = [layer("a", "Dev"), layer("b", "Stage"), layer("c", "Prod")];
    let { label } = render(layers, "ship/b");
    act(() => label!.click());
    expect(onOpen).toHaveBeenLastCalledWith("ship/c");
    ({ label } = render(layers, "ship/c"));
    act(() => label!.click());
    expect(onOpen).toHaveBeenLastCalledWith("ship/a");
  });

  it("opens a layer whose dot a dragged button hovers for 500ms", () => {
    vi.useFakeTimers();
    const { dots } = render([layer("a"), layer("b")], "ship/a", true);
    act(() => enter(dots[1]));
    act(() => vi.advanceTimersByTime(499));
    expect(onOpen).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onOpen).toHaveBeenCalledWith("ship/b");
  });

  it("does not open a layer the drag leaves early or that a plain hover reaches", () => {
    vi.useFakeTimers();
    let { dots } = render([layer("a"), layer("b")], "ship/a", true);
    act(() => enter(dots[1]));
    act(() => vi.advanceTimersByTime(300));
    act(() => leave(dots[1]));
    act(() => vi.advanceTimersByTime(500));
    ({ dots } = render([layer("a"), layer("b")], "ship/a", false));
    act(() => enter(dots[1]));
    act(() => vi.advanceTimersByTime(500));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("drops a pending hover-open when the drag ends", () => {
    vi.useFakeTimers();
    const { dots } = render([layer("a"), layer("b")], "ship/a", true);
    act(() => enter(dots[1]));
    act(() => vi.advanceTimersByTime(300));
    render([layer("a"), layer("b")], "ship/a", false);
    act(() => vi.advanceTimersByTime(500));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("drops a pending hover-open when it unmounts", () => {
    vi.useFakeTimers();
    const { dots } = render([layer("a"), layer("b")], "ship/a", true);
    act(() => enter(dots[1]));
    act(() => vi.advanceTimersByTime(300));
    act(() => root.unmount());
    act(() => vi.advanceTimersByTime(500));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("eases its dots only when motion is allowed", () => {
    const dot = render([layer("a"), layer("b")], "ship/a").dots[0].firstElementChild!;
    expect(dot.className).toContain("transition-[width,height,background-color]");
    expect(dot.className).toContain("motion-reduce:transition-none");
  });

  it("draws the open layer as a capsule and grows every dot while a button is dragged", () => {
    const size = (dragging: boolean) =>
      render([layer("a"), layer("b")], "ship/a", dragging).dots.map((dot) => dot.firstElementChild!.className);
    const [open, closed] = size(false);
    expect(open).toContain("h-1 w-3");
    expect(closed).toContain("h-1 w-1");
    const [dragOpen, dragClosed] = size(true);
    expect(dragOpen).toContain("h-2 w-4");
    expect(dragClosed).toContain("h-2 w-2");
  });

  it("sits on the border line, a little taller while a button is dragged", () => {
    expect(render([layer("a"), layer("b")], "ship/a").pill!.className).toContain("bottom-[-5.5px] h-[10px]");
    expect(render([layer("a"), layer("b")], "ship/a", true).pill!.className).toContain("bottom-[-7.5px] h-[14px]");
  });

  it("brightens only a closed dot on hover", () => {
    const [open, closed] = render([layer("a"), layer("b")], "ship/a").dots.map((dot) => dot.firstElementChild!.className);
    expect(open).not.toContain("group-hover/dot:");
    expect(closed).toContain("group-hover/dot:");
  });
});
