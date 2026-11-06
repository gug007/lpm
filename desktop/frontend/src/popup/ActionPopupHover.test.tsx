// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionInfo, ActionPopupInfo } from "../types";

vi.mock("./ActionPopupCard", () => ({ ActionPopupCard: () => <div>card</div> }));
vi.mock("../store/overlay", () => ({ useOverlay: () => {} }));

import { ActionPopupHover } from "./ActionPopupHover";

const popup: ActionPopupInfo = { format: "html", title: "GitHub stars", width: 300, height: 160 };
const action = { name: "stars", label: "Stars", cmd: "x", confirm: false, display: "", popup } as ActionInfo;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const dialog = () => document.querySelector('[role="dialog"]');

function openCard() {
  act(() => root.render(<ActionPopupHover project="storefront" action={action} popup={popup}><button>Stars</button></ActionPopupHover>));
  const trigger = container.querySelector("span")!;
  act(() => {
    trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
  act(() => {
    vi.advanceTimersByTime(400);
  });
  expect(dialog()).not.toBeNull();
  return trigger;
}

describe("ActionPopupHover", () => {
  it("stays open while something else scrolls", () => {
    openCard();
    const terminal = document.createElement("div");
    document.body.appendChild(terminal);
    act(() => {
      terminal.dispatchEvent(new Event("scroll"));
    });
    expect(dialog()).not.toBeNull();
    terminal.remove();
  });

  it("closes when a scroll moves the button", () => {
    const trigger = openCard();
    trigger.getBoundingClientRect = () => new DOMRect(0, 40, 80, 30);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(dialog()).toBeNull();
  });
});
