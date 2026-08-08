// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CountBadge } from "./CountBadge";

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

const draw = (count: number) =>
  act(() => {
    root.render(<CountBadge count={count} label="unread automations" />);
  });

describe("CountBadge", () => {
  it("renders nothing when there is nothing waiting", () => {
    draw(0);
    expect(host.innerHTML).toBe("");
  });

  it("names the count for screen readers", () => {
    draw(4);
    const badge = host.querySelector("[aria-label]");
    expect(badge?.getAttribute("aria-label")).toBe("4 unread automations");
    expect(badge?.textContent).toBe("4");
  });

  it("caps runaway counts so the badge keeps its shape", () => {
    draw(1240);
    expect(host.textContent).toBe("99+");
    expect(host.querySelector("[aria-label]")?.getAttribute("aria-label")).toBe(
      "1240 unread automations",
    );
  });
});
