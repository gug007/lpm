// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useKeyboardShortcut } from "./useKeyboardShortcut";

let container: HTMLDivElement;
let root: Root;

function Harness({ onE, onD }: { onE: () => void; onD: () => void }) {
  useKeyboardShortcut({ key: "e", meta: true }, onE);
  useKeyboardShortcut({ key: "d", meta: true, whileTyping: false }, onD);
  return null;
}

function press(target: Element, key: string) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, metaKey: true, bubbles: true, cancelable: true }),
  );
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useKeyboardShortcut whileTyping", () => {
  it("fires by default from inside a text scope, and stands down when opted out", () => {
    const onE = vi.fn();
    const onD = vi.fn();
    act(() => root.render(<Harness onE={onE} onD={onD} />));

    const field = document.createElement("div");
    field.setAttribute("data-text-scope", "");
    document.body.appendChild(field);

    press(field, "e");
    press(field, "d");
    expect(onE).toHaveBeenCalledTimes(1);
    expect(onD).not.toHaveBeenCalled();

    press(document.body, "d");
    expect(onD).toHaveBeenCalledTimes(1);

    field.remove();
  });
});
