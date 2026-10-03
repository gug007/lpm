// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndContext } from "@dnd-kit/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZoneLayerView } from "../actionsLayoutModel";
import type { ActionInfo, LayerInfo, ZoneDisplay, ZoneInfo } from "../types";
import { useZoneLayers } from "../store/zoneLayers";
import { ZoneView } from "./ZoneView";

const action = (name: string): ActionInfo =>
  ({ name, label: name, cmd: `run ${name}`, confirm: false, display: "ship" }) as ActionInfo;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useZoneLayers.setState({ open: {} });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function mount(zone: ZoneInfo, display: ZoneDisplay, layers: ZoneLayerView[]) {
  act(() =>
    root.render(
      <DndContext>
        <ZoneView
          zone={zone}
          display={display}
          layers={layers}
          projectName="app"
          disabled={false}
          scope="t"
          onRun={() => {}}
        />
      </DndContext>,
    ),
  );
  return container.querySelector<HTMLElement>("[data-zone-frame]")!;
}

function render(display: ZoneDisplay, ids = ["prod"]) {
  const zone: ZoneInfo = { name: "ship", label: "Ship", rows: 2, source: "project", display };
  mount(zone, display, [{ key: "ship", layer: null, ids, actions: ids.map(action) }]);
  const frame = container.querySelector<HTMLElement>('[data-actions-group="zone:ship"]')!.parentElement!;
  return { frame, button: frame.querySelector("button") };
}

const LAYERS: LayerInfo[] = [{ name: "dev", label: "Dev" }, { name: "prod" }];

function renderLayered(layers: LayerInfo[] = LAYERS, display: ZoneDisplay = "header") {
  const zone: ZoneInfo = { name: "ship", label: "Ship", rows: 2, source: "project", display, layers };
  const views = layers.map((layer, index) => {
    const ids = [`${layer.name}-${index}`];
    return { key: `ship/${layer.name}`, layer, ids, actions: ids.map(action) };
  });
  const frame = mount(zone, display, views);
  return {
    frame,
    dots: [...frame.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")],
    groups: () => [...frame.querySelectorAll("[data-actions-group]")].map((group) => group.getAttribute("data-actions-group")),
  };
}

describe("ZoneView", () => {
  it("spans two footer rows in the footer and two header rows in the header", () => {
    expect(render("footer").frame.style.height).toBe("57px");
    expect(render("header").frame.style.height).toBe("72px");
  });

  it("draws its buttons in the footer's colours in the footer", () => {
    expect(render("footer").button?.className).toContain("border-[var(--composer-border)]");
    expect(render("header").button?.className).toContain("border-[var(--border)]");
  });

  it("frames itself in the footer's colours in the footer", () => {
    expect(render("footer").frame.className).toContain("var(--composer-fg)");
    expect(render("header").frame.className).toContain("var(--text-primary)");
  });

  it("tells the footer's empty hint apart", () => {
    expect(render("footer", []).frame.textContent).toBe("Drop buttons here");
    expect(render("footer", []).frame.querySelector("span")?.className).toContain("--composer-fg-muted");
  });
});

describe("a zone with layers", () => {
  it("has no dots and one list with a single layer", () => {
    const { dots, groups } = renderLayered([{ name: "dev" }]);
    expect(dots).toEqual([]);
    expect(groups()).toEqual(["zone:ship/dev"]);
  });

  it("drops into the open layer and shows the others inert", () => {
    useZoneLayers.getState().setOpen("app", "ship", "prod");
    const { frame, groups } = renderLayered();
    expect(groups()).toEqual(["zone:ship/prod"]);
    const pages = [...frame.querySelectorAll<HTMLElement>("[data-zone-layer]")];
    expect(pages.map((page) => page.hasAttribute("inert"))).toEqual([true, false]);
    expect(pages[0].textContent).toBe("dev-0");
  });

  it("puts its dots on the frame and opens a layer from them", () => {
    const { dots, groups } = renderLayered();
    expect(dots.map((dot) => dot.getAttribute("aria-label"))).toEqual(["Dev", "Layer 2"]);
    act(() => dots[1].click());
    expect(useZoneLayers.getState().open["app\u0000ship"]).toBe("prod");
    expect(groups()).toEqual(["zone:ship/prod"]);
  });

  it("steps through its layers on a sideways swipe, stopping at the ends", () => {
    vi.useFakeTimers();
    const { frame, groups } = renderLayered([{ name: "a" }, { name: "b" }]);
    const swipe = (deltaX: number) => {
      act(() => {
        frame.dispatchEvent(new WheelEvent("wheel", { deltaX, bubbles: true, cancelable: true }));
      });
      vi.advanceTimersByTime(450);
    };
    swipe(40);
    expect(groups()).toEqual(["zone:ship/b"]);
    swipe(40);
    expect(groups()).toEqual(["zone:ship/b"]);
    swipe(-40);
    expect(groups()).toEqual(["zone:ship/a"]);
    swipe(-40);
    expect(groups()).toEqual(["zone:ship/a"]);
  });
});
