// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SidebarOriginMark } from "./SidebarOriginMark";
import { useOriginStatus } from "../store/originStatus";
import type { OriginStatus } from "../originStatus";

const ROOT = "/Users/me/Projects/lpm-demo";
let container: HTMLDivElement;
let root: Root;

const status = (over: Partial<OriginStatus> = {}): OriginStatus => ({
  branch: "main",
  hasUpstream: true,
  ahead: 0,
  behind: 0,
  base: "",
  baseBehind: 0,
  conflicted: false,
  fetched: true,
  ...over,
});

function show(over: Partial<OriginStatus>, extra: { running?: boolean; done?: string } = {}) {
  act(() => {
    useOriginStatus.getState().reset();
    useOriginStatus.getState().setStatus(ROOT, status(over));
    if (extra.running) useOriginStatus.getState().setRunning(ROOT, true);
    if (extra.done) useOriginStatus.getState().setDone(ROOT, extra.done);
    root.render(<SidebarOriginMark root={ROOT} />);
  });
  return container.firstElementChild as HTMLElement | null;
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

describe("SidebarOriginMark", () => {
  it("stays out of the row when origin has nothing new", () => {
    expect(show({})).toBeNull();
    expect(show({ ahead: 3 })).toBeNull();
  });

  it("shows the count, and keeps the hover label's width ready", () => {
    const mark = show({ behind: 3 })!;
    expect(mark.title).toBe("Origin has 3 new commits on main");
    const [rest, hover] = Array.from(mark.children) as HTMLElement[];
    expect(rest.textContent).toBe("↓3");
    expect(hover.textContent).toBe("↓ Pull 3");
    expect(hover.getAttribute("aria-hidden")).toBe("true");
  });

  it("names the branch a copy is measured against", () => {
    const mark = show({ branch: "demo-tour", hasUpstream: false, base: "main", baseBehind: 12 })!;
    expect(mark.firstElementChild!.textContent).toBe("main+12");
  });

  it("shows both directions when there is something to push as well", () => {
    expect(show({ ahead: 2, behind: 1 })!.firstElementChild!.textContent).toBe("↑2↓1");
  });

  it("spins while catching up, then confirms", () => {
    expect(show({ behind: 3 }, { running: true })!.title).toBe("Catching up with origin…");
    expect(show({}, { done: "Pulled 3" })!.textContent).toBe("✓ Pulled 3");
  });

  it("flags a stopped pull", () => {
    expect(show({ conflicted: true })!.firstElementChild!.textContent).toBe("Conflict");
  });
});
