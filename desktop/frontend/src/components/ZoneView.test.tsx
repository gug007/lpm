// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndContext } from "@dnd-kit/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ActionInfo, ZoneDisplay, ZoneInfo } from "../types";
import { ZoneView } from "./ZoneView";

const action = (name: string): ActionInfo =>
  ({ name, label: name, cmd: `run ${name}`, confirm: false, display: "ship" }) as ActionInfo;

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

function render(display: ZoneDisplay, ids = ["prod"]) {
  const zone: ZoneInfo = { name: "ship", label: "Ship", rows: 2, source: "project", display };
  act(() =>
    root.render(
      <DndContext>
        <ZoneView zone={zone} display={display} ids={ids} actions={ids.map(action)} disabled={false} scope="t" onRun={() => {}} />
      </DndContext>,
    ),
  );
  const frame = container.querySelector<HTMLElement>('[data-actions-group="zone:ship"]')!.parentElement!;
  return { frame, button: frame.querySelector("button") };
}

describe("ZoneView", () => {
  it("spans two footer rows in the footer and two header rows in the header", () => {
    expect(render("footer").frame.style.height).toBe("57px");
    expect(render("header").frame.style.height).toBe("72px");
  });

  it("draws its buttons in the footer's colours in the footer", () => {
    expect(render("footer").button?.className).toContain("border-[var(--composer-border)]");
    expect(render("header").button?.className).toContain("border-[var(--border)]");
  });

  it("frames itself in the footer's colours in the footer", () => {
    expect(render("footer").frame.className).toContain("var(--composer-fg)");
    expect(render("header").frame.className).toContain("var(--text-primary)");
  });

  it("tells the footer's empty hint apart", () => {
    expect(render("footer", []).frame.textContent).toBe("Drop buttons here");
    expect(render("footer", []).frame.querySelector("span")?.className).toContain("--composer-fg-muted");
  });
});
