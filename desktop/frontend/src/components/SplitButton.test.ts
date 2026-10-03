// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ActionInfo } from "../types";
import { type ActionSize, SplitButton, splitPanelSide } from "./SplitButton";

const SHIP = {
  name: "ship",
  label: "Ship",
  cmd: "run ship",
  confirm: false,
  display: "header",
  children: [{ name: "ship:a", label: "a", cmd: "run a", confirm: false, display: "menu" }],
} as ActionInfo;

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

function wrapperClasses(size: ActionSize): string[] {
  act(() => root.render(createElement(SplitButton, { action: SHIP, disabled: false, onRunAction: () => {}, size })));
  return container.firstElementChild!.className.split(" ");
}

describe("split button dropdowns", () => {
  it("open upward from the footer and from footer zones", () => {
    expect(splitPanelSide("compact")).toBe("above");
    expect(splitPanelSide("footerZone")).toBe("above");
  });

  it("open downward from the header and from header zones", () => {
    expect(splitPanelSide("default")).toBe("below");
    expect(splitPanelSide("zone")).toBe("below");
  });
});

describe("split button wrapper", () => {
  it("is a flex box in both zone sizes, so the button isn't pushed down by a line box, and stays as it was elsewhere", () => {
    expect(wrapperClasses("zone")).toEqual(expect.arrayContaining(["flex", "h-full", "w-full"]));
    expect(wrapperClasses("footerZone")).toEqual(expect.arrayContaining(["flex", "h-full", "w-full"]));
    expect(wrapperClasses("default")).not.toContain("flex");
    expect(wrapperClasses("compact")).not.toContain("flex");
  });
});
