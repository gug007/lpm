// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AIButton } from "./AIButton";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("AIButton", () => {
  // The skill form hosts this button inside its <form>, where an untyped button
  // submits: one click on Draft used to try to create the half-written skill and
  // paint every empty field red.
  it("does not submit the form it sits in", () => {
    const submit = vi.fn((e: Event) => e.preventDefault());
    const generate = vi.fn();
    act(() => {
      root.render(
        <form onSubmit={(e) => submit(e.nativeEvent)}>
          <AIButton
            onClick={generate}
            trailing={
              <button type="button" data-testid="picker">
                v
              </button>
            }
          >
            Draft
          </AIButton>
        </form>,
      );
    });

    const buttons = host.querySelectorAll("button");
    for (const button of buttons) {
      expect(button.type).toBe("button");
    }

    act(() => {
      (buttons[0] as HTMLButtonElement).click();
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });
});
