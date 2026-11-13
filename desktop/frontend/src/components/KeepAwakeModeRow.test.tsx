// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeepAwakeModeRow } from "./KeepAwakeModeRow";

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

const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

describe("KeepAwakeModeRow", () => {
  it("selects the mode from its description and its padding, not just its title", () => {
    const onSelect = vi.fn();
    act(() =>
      root.render(
        <KeepAwakeModeRow checked={false} label="Off" detail="Sleeps on its usual schedule" onSelect={onSelect} />,
      ),
    );
    const detail = [...container.querySelectorAll("*")].find((el) => el.textContent === "Sleeps on its usual schedule")!;
    click(detail);
    click(container.firstElementChild!);
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("leaves a choice's own controls to themselves", () => {
    const onSelect = vi.fn();
    const onChip = vi.fn();
    act(() =>
      root.render(
        <KeepAwakeModeRow checked label="While agents work" onSelect={onSelect}>
          <button type="button" onClick={onChip}>
            5m
          </button>
        </KeepAwakeModeRow>,
      ),
    );
    click([...container.querySelectorAll("button")].find((b) => b.textContent === "5m")!);
    expect(onChip).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
