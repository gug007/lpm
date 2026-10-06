// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const open = vi.hoisted(() => vi.fn());
vi.mock("../../bridge/runtime", () => ({ BrowserOpenURL: open }));

import { ExternalBrowserPane } from "./ExternalBrowserPane";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  open.mockClear();
  act(() => root.render(<ExternalBrowserPane id="b1" active />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function submit(value: string) {
  const input = host.querySelector("input")!;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("ExternalBrowserPane", () => {
  it("opens the address in the system browser", () => {
    submit("localhost:3000");
    expect(open).toHaveBeenCalledWith("http://localhost:3000");
    expect(host.textContent).toContain("Opened localhost");
  });

  it("turns free text into a search", () => {
    submit("tauri docs");
    expect(open).toHaveBeenCalledWith("https://www.google.com/search?q=tauri%20docs");
  });

  it("opens nothing for an empty address", () => {
    submit("   ");
    expect(open).not.toHaveBeenCalled();
  });
});
