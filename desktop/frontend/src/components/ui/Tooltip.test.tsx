// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tooltip } from "./Tooltip";

function PopoverButton() {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip content="Memory">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        brain
      </button>
    </Tooltip>
  );
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<PopoverButton />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const trigger = () => host.querySelector("button")!.parentElement!;
const tooltip = () => document.querySelector('[role="tooltip"]');

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function hover() {
  act(() => {
    trigger().dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
  });
}

function leave() {
  act(() => {
    trigger().dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
  });
}

async function click() {
  act(() => host.querySelector("button")!.click());
  await flush();
}

describe("Tooltip over a button that opens a popover", () => {
  it("shows on hover", () => {
    hover();
    expect(tooltip()?.textContent).toBe("Memory");
  });

  it("goes away when the click opens the popover, and stays away on hover", async () => {
    hover();
    await click();
    expect(tooltip()).toBeNull();

    leave();
    hover();
    expect(tooltip()).toBeNull();
  });

  it("comes back only after the pointer leaves the closed trigger and returns", async () => {
    hover();
    await click();
    await click();
    expect(tooltip()).toBeNull();

    leave();
    hover();
    expect(tooltip()?.textContent).toBe("Memory");
  });
});

describe("Tooltip with buttons of its own", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const pressed = vi.fn();
  const extend = () => [...document.querySelectorAll("button")].find((b) => b.textContent === "+1 h");
  const pointer = (type: "mouseover" | "mouseout", el: Element) =>
    act(() => {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget: document.body }));
    });

  beforeEach(() => {
    act(() =>
      root.render(
        <Tooltip
          interactive
          content={
            <button type="button" onClick={pressed}>
              +1 h
            </button>
          }
        >
          <button type="button">row</button>
        </Tooltip>,
      ),
    );
  });

  it("stays up while the pointer crosses onto it, and its buttons work", () => {
    hover();
    expect(extend()).toBeDefined();
    expect(tooltip()).toBeNull();

    leave();
    act(() => vi.advanceTimersByTime(100));
    pointer("mouseover", extend()!);
    act(() => vi.advanceTimersByTime(1_000));
    act(() => extend()!.click());

    expect(pressed).toHaveBeenCalled();
    expect(extend()).toBeDefined();
  });

  it("goes a moment after the pointer leaves it", () => {
    hover();
    leave();
    act(() => vi.advanceTimersByTime(250));

    expect(extend()).toBeUndefined();
  });

  it("goes a moment after the pointer leaves the card itself", () => {
    hover();
    pointer("mouseover", extend()!);
    pointer("mouseout", extend()!);
    act(() => vi.advanceTimersByTime(250));

    expect(extend()).toBeUndefined();
  });
});
