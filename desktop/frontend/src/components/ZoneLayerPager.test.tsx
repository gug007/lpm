// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ZoneLayerView } from "../actionsLayoutModel";
import { ZoneLayerPager } from "./ZoneLayerPager";

const layer = (name: string): ZoneLayerView => ({ key: `ship/${name}`, layer: { name }, ids: [], actions: [] });
const layers = [layer("a"), layer("b"), layer("c")];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(openKey: string) {
  act(() =>
    root.render(
      <ZoneLayerPager
        layers={layers}
        openKey={openKey}
        renderPage={(page, open) => <span data-page={page.key}>{open ? "open" : "closed"}</span>}
      />,
    ),
  );
  const viewport = container.firstElementChild as HTMLElement;
  return { viewport, pages: [...viewport.children] as HTMLElement[] };
}

describe("ZoneLayerPager", () => {
  it("stacks every page in one grid cell, so the zone keeps the widest page's width", () => {
    const { viewport, pages } = render("ship/b");
    expect(viewport.className).toContain("grid");
    expect(viewport.className).toContain("overflow-hidden");
    expect(pages.map((page) => page.style.gridArea)).toEqual(["1 / 1", "1 / 1", "1 / 1"]);
  });

  it("renders each page with whether it's open", () => {
    expect(render("ship/b").viewport.textContent).toBe("closedopenclosed");
  });

  it("slides the other pages a page and a gap aside", () => {
    const { pages } = render("ship/b");
    expect(pages.map((page) => page.style.transform)).toEqual([
      "translateX(calc(-1 * (100% + 16px)))",
      "translateX(calc(0 * (100% + 16px)))",
      "translateX(calc(1 * (100% + 16px)))",
    ]);
    expect(pages[1].style.transition).toContain("340ms");
  });

  it("hides the other pages from input and assistive tech", () => {
    const { pages } = render("ship/c");
    expect(pages.map((page) => page.hasAttribute("inert"))).toEqual([true, true, false]);
    expect(pages.map((page) => page.getAttribute("aria-hidden"))).toEqual(["true", "true", null]);
    expect(pages[0].style.opacity).toBe("0.12");
    expect(pages[2].style.opacity).toBe("");
  });

  it("opens the first page when the open key names none", () => {
    expect(render("ship/gone").viewport.textContent).toBe("openclosedclosed");
  });
});
