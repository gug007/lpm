// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HostActionError } from "./HostActionError";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (text: string) => act(() => root.render(<HostActionError text={text} />));

describe("HostActionError", () => {
  // An installer's verdict is its last line, under everything apt printed first.
  it("shows the end of the output, again whenever it changes", () => {
    render("Restarting services...\nlpm was installed but never started.");
    const box = container.querySelector("p")!;
    Object.defineProperty(box, "scrollHeight", { configurable: true, value: 480 });
    render("Permission denied (publickey).");
    expect(box.scrollTop).toBe(480);
    expect(box.textContent).toBe("Permission denied (publickey).");
  });
});
