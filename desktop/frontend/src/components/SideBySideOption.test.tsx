// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SideBySideOption } from "./SideBySideOption";
import type { SideBySideLayout } from "../sideBySide";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function show(enabled: boolean, layout: SideBySideLayout) {
  const onEnabledChange = vi.fn();
  const onLayoutChange = vi.fn();
  act(() =>
    root.render(
      <SideBySideOption
        enabled={enabled}
        onEnabledChange={onEnabledChange}
        layout={layout}
        onLayoutChange={onLayoutChange}
      />,
    ),
  );
  return { onEnabledChange, onLayoutChange };
}

const layoutButton = (label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Side by side layout"] button')].find(
    (b) => b.textContent === label,
  );

describe("SideBySideOption", () => {
  it("offers columns or rows while side by side is on", () => {
    const { onLayoutChange } = show(true, "columns");
    expect(layoutButton("Columns")?.getAttribute("aria-pressed")).toBe("true");
    act(() => layoutButton("Rows")!.click());
    expect(onLayoutChange).toHaveBeenCalledWith("rows");
  });

  it("hides the layout while side by side is off", () => {
    const { onEnabledChange } = show(false, "rows");
    expect(layoutButton("Rows")).toBeUndefined();
    act(() => container.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
    expect(onEnabledChange).toHaveBeenCalledWith(true);
  });

  it("describes the chosen layout", () => {
    show(true, "rows");
    expect(container.textContent).toContain("one above the other");
    show(true, "columns");
    expect(container.textContent).toContain("next to each other");
  });
});
