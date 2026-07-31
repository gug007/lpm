// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RowMenu } from "./RowMenu";

let container: HTMLDivElement;
let root: Root;
const pick = vi.fn();

const render = () =>
  act(() => {
    root.render(
      <RowMenu ariaLabel="Options for Studio" items={[{ label: "Disconnect…", onClick: pick }]} />,
    );
  });

const trigger = () => container.querySelector("button")!;
const menuItem = () =>
  [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Disconnect…");

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  pick.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("RowMenu", () => {
  // The panel is portaled out of the settings pane, which animates in and would
  // otherwise become the containing block for it and clip it out of existence.
  it("opens outside the row it belongs to", () => {
    render();
    act(() => trigger().click());
    expect(menuItem()).toBeDefined();
    expect(container.contains(menuItem()!)).toBe(false);
  });

  it("closes on a second click of the same button", () => {
    render();
    act(() => trigger().click());
    act(() => trigger().click());
    expect(menuItem()).toBeUndefined();
  });

  it("runs an item and closes", () => {
    render();
    act(() => trigger().click());
    act(() => menuItem()!.click());
    expect(pick).toHaveBeenCalledOnce();
    expect(menuItem()).toBeUndefined();
  });
});
