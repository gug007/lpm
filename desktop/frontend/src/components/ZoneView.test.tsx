// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndContext } from "@dnd-kit/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZoneLayerView } from "../actionsLayoutModel";
import type { ActionInfo, LayerInfo, ZoneDisplay, ZoneInfo } from "../types";
import { useZoneLayers } from "../store/zoneLayers";
import { OPEN_DELAY_MS } from "../hooks/useHoverPopup";
import { ZoneView } from "./ZoneView";

const h = vi.hoisted(() => ({ setZoneCollapsed: vi.fn(), onRun: vi.fn() }));
vi.mock("../../bridge/runtime", () => ({ EventsOn: () => () => {} }));
vi.mock("../zoneActions", () => ({ setZoneCollapsed: h.setZoneCollapsed }));

const action = (name: string): ActionInfo =>
  ({ name, label: name, cmd: `run ${name}`, confirm: false, display: "ship" }) as ActionInfo;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useZoneLayers.setState({ open: {} });
  onZoneContextMenu.mockReset();
  h.setZoneCollapsed.mockReset();
  h.onRun.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const onZoneContextMenu = vi.fn();

function mount(zone: ZoneInfo, display: ZoneDisplay, layers: ZoneLayerView[], projectName = "app") {
  act(() =>
    root.render(
      <DndContext>
        <ZoneView
          zone={zone}
          display={display}
          layers={layers}
          projectName={projectName}
          disabled={false}
          onRun={h.onRun}
          onZoneContextMenu={onZoneContextMenu}
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

const rightClick = (el: Element) => {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  act(() => {
    el.dispatchEvent(event);
  });
  return event;
};

describe("ZoneView", () => {
  it("is a group named by its label", () => {
    const { frame } = renderLayered();
    expect(frame.getAttribute("role")).toBe("group");
    expect(frame.getAttribute("aria-label")).toBe("Ship");
  });

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

describe("collapsing a zone", () => {
  it("collapses from the corner button", () => {
    const zone: ZoneInfo = { name: "ship", label: "Ship", rows: 1, source: "project" };
    const frame = mount(zone, "header", [{ key: "ship", layer: null, ids: ["prod"], actions: [action("prod")] }]);
    act(() => frame.querySelector<HTMLButtonElement>('[aria-label="Collapse zone"]')!.click());
    expect(h.setZoneCollapsed).toHaveBeenCalledWith("app", zone, true);
  });
});

describe("a folded zone", () => {
  const folded = (over: Partial<ZoneInfo> = {}): ZoneInfo => ({
    name: "ship",
    label: "Ship",
    rows: 1,
    source: "project",
    collapsed: true,
    ...over,
  });
  const foldedLayers = (): ZoneLayerView[] => [{ key: "ship", layer: null, ids: ["prod"], actions: [action("prod")] }];
  const popupEl = () => document.querySelector<HTMLElement>("[data-zone-popup]");

  it("shows a folded zone as one button instead of the frame", () => {
    mount(folded(), "header", foldedLayers());
    expect(container.querySelector("[data-zone-frame]")).toBeNull();
    expect(container.querySelector("[data-collapsed-zone]")?.textContent).toContain("Ship");
  });

  it("expands from the ⤢ half", () => {
    const zone = folded();
    mount(zone, "header", foldedLayers());
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Expand zone"]')!.click());
    expect(h.setZoneCollapsed).toHaveBeenCalledWith("app", zone, false);
  });

  it("opens the zone's grid from the label and keeps it open after a run", () => {
    mount(folded(), "header", foldedLayers());
    act(() => container.querySelector<HTMLButtonElement>("[data-collapsed-zone] button[aria-haspopup]")!.click());
    const run = [...popupEl()!.querySelectorAll("button")].find((b) => b.textContent === "prod")!;
    act(() => run.click());
    expect(h.onRun).toHaveBeenCalledWith(expect.objectContaining({ name: "prod" }));
    expect(popupEl()).not.toBeNull();
  });

  it("lays the popup out as the zone's own drop group", () => {
    mount(folded(), "header", foldedLayers());
    act(() => container.querySelector<HTMLButtonElement>("[data-collapsed-zone] button[aria-haspopup]")!.click());
    expect(popupEl()!.querySelector('[data-actions-group="zone:ship"]')).not.toBeNull();
  });

  it("closes the popup on Escape", () => {
    mount(folded(), "header", foldedLayers());
    act(() => container.querySelector<HTMLButtonElement>("[data-collapsed-zone] button[aria-haspopup]")!.click());
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(popupEl()).toBeNull();
  });

  it("closes the popup when the window is resized", () => {
    mount(folded(), "header", foldedLayers());
    act(() => container.querySelector<HTMLButtonElement>("[data-collapsed-zone] button[aria-haspopup]")!.click());
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(popupEl()).toBeNull();
  });

  it("keeps a press inside the popup from reaching the row's drag handler", () => {
    const spy = vi.fn();
    act(() =>
      root.render(
        <DndContext>
          <div onPointerDown={spy}>
            <ZoneView
              zone={folded()}
              display="header"
              layers={foldedLayers()}
              projectName="app"
              disabled={false}
              onRun={h.onRun}
              onZoneContextMenu={onZoneContextMenu}
            />
          </div>
        </DndContext>,
      ),
    );
    act(() => container.querySelector<HTMLButtonElement>("[data-collapsed-zone] button[aria-haspopup]")!.click());
    const run = [...popupEl()!.querySelectorAll("button")].find((b) => b.textContent === "prod")!;
    act(() => {
      run.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("brings the terminal's colours to a footer popup, not a header one", () => {
    const openPopup = (display: ZoneDisplay) => {
      mount(folded(), display, foldedLayers());
      act(() => container.querySelector<HTMLButtonElement>("[data-collapsed-zone] button[aria-haspopup]")!.click());
      return popupEl()!.closest<HTMLElement>(".composer-terminal-surface");
    };
    expect(openPopup("footer")?.style.getPropertyValue("--terminal-bg")).toBeTruthy();
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(openPopup("header")).toBeNull();
  });

  it("closes on a press outside without taking focus from where it went", () => {
    mount(folded(), "header", foldedLayers());
    act(() => container.querySelector<HTMLButtonElement>("[data-collapsed-zone] button[aria-haspopup]")!.click());
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    act(() => {
      input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(popupEl()).toBeNull();
    expect(document.activeElement).toBe(input);
    input.remove();
  });

  it("leaves focus where it is on Escape when it isn't in the popup", () => {
    mount(folded(), "header", foldedLayers());
    act(() => container.querySelector<HTMLButtonElement>("[data-collapsed-zone] button[aria-haspopup]")!.click());
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(popupEl()).toBeNull();
    expect(document.activeElement).toBe(input);
    input.remove();
  });

  it("returns focus to the label on Escape from inside the popup", () => {
    mount(folded(), "header", foldedLayers());
    const label = container.querySelector<HTMLButtonElement>("[data-collapsed-zone] button[aria-haspopup]")!;
    act(() => label.focus());
    act(() => {
      label.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(popupEl()).toBeNull();
    expect(document.activeElement).toBe(label);
  });

  it("ignores a rest on the label until the pointer has been off it, as after a fold", () => {
    vi.useFakeTimers();
    mount(folded(), "header", foldedLayers());
    const label = container.querySelector<HTMLButtonElement>("[data-collapsed-zone] button[aria-haspopup]")!;
    const rest = () => {
      act(() => {
        label.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
      });
      act(() => vi.advanceTimersByTime(OPEN_DELAY_MS));
    };
    rest();
    expect(popupEl()).toBeNull();
    act(() => {
      label.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body }));
    });
    act(() => {
      document.body.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    });
    rest();
    expect(popupEl()).not.toBeNull();
  });

  it("moves focus into the popup when ArrowDown opens it", () => {
    mount(folded(), "header", foldedLayers());
    const label = container.querySelector<HTMLButtonElement>("[data-collapsed-zone] button[aria-haspopup]")!;
    act(() => label.focus());
    act(() => {
      label.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });
    expect(popupEl()!.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.tagName).toBe("BUTTON");
  });

  it("leaves focus on the label when a click opens the popup", () => {
    mount(folded(), "header", foldedLayers());
    const label = container.querySelector<HTMLButtonElement>("[data-collapsed-zone] button[aria-haspopup]")!;
    act(() => label.focus());
    act(() => {
      label.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    });
    expect(popupEl()).not.toBeNull();
    expect(document.activeElement).toBe(label);
  });

  it("moves focus into the popup when a keyboard activation opens it", () => {
    mount(folded(), "header", foldedLayers());
    const label = container.querySelector<HTMLButtonElement>("[data-collapsed-zone] button[aria-haspopup]")!;
    act(() => label.focus());
    act(() => {
      label.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    });
    expect(popupEl()!.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.tagName).toBe("BUTTON");
  });

  it("opens the zone menu on a right-click of the folded button", () => {
    mount(folded(), "header", foldedLayers());
    rightClick(container.querySelector("[data-collapsed-zone] button[aria-haspopup]")!);
    expect(onZoneContextMenu).toHaveBeenCalledTimes(1);
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

describe("right-clicking a zone", () => {
  const LABELLED: LayerInfo[] = [{ name: "dev", label: "Dev" }, { name: "prod", label: "Prod" }];

  it("opens the zone's menu from its empty space", () => {
    const { frame } = renderLayered();
    expect(rightClick(frame).defaultPrevented).toBe(true);
    expect(onZoneContextMenu).toHaveBeenCalledTimes(1);
  });

  it("opens the zone's menu from a layer dot", () => {
    const { dots } = renderLayered();
    expect(rightClick(dots[1]).defaultPrevented).toBe(true);
    expect(onZoneContextMenu).toHaveBeenCalledTimes(1);
  });

  it("opens the zone's menu from the layer name", () => {
    const { frame } = renderLayered(LABELLED);
    const name = frame.querySelector<HTMLElement>("[data-zone-dots] button:not([aria-pressed])")!;
    expect(rightClick(name).defaultPrevented).toBe(true);
    expect(onZoneContextMenu).toHaveBeenCalledTimes(1);
  });

  it("leaves a button's right-click to the button", () => {
    const { frame } = renderLayered();
    rightClick(frame.querySelector("[data-actions-group] button")!);
    expect(onZoneContextMenu).not.toHaveBeenCalled();
  });
});
