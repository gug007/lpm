// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildActionsModel } from "../../actionsLayoutModel";
import type { ActionInfo, ZoneDisplay, ZoneInfo } from "../../types";
import type { ActionsSnapshot } from "../../zoneConfig";

const h = vi.hoisted(() => ({ createZone: vi.fn() }));
vi.mock("../../zoneActions", () => ({ createZone: h.createZone }));

import { RowMenus } from "./RowMenus";

const EXISTING: ZoneInfo = { name: "build", label: "Build", rows: 1, source: "project" };
const ACTIONS = [{ name: "test", label: "test", cmd: "run test", confirm: false, display: "" } as ActionInfo];
const SNAPSHOT: ActionsSnapshot = {
  actions: ACTIONS,
  zones: [EXISTING],
  layout: buildActionsModel(ACTIONS, [EXISTING]).layout,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  h.createZone.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

function setValue(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function open(row: ZoneDisplay) {
  const onNewAction = vi.fn();
  const onClose = vi.fn();
  act(() =>
    root.render(
      <RowMenus
        projectName="web"
        snapshot={SNAPSHOT}
        menu={{ x: 1, y: 2, row }}
        onClose={onClose}
        onNewAction={onNewAction}
      />,
    ),
  );
  return { onNewAction, onClose };
}

describe("RowMenus", () => {
  it("opens the action form for the row it was opened on", () => {
    const { onNewAction, onClose } = open("footer");
    act(() => button("New action")!.click());
    expect(onNewAction).toHaveBeenCalledWith("footer");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("creates a named footer zone in the footer", () => {
    open("footer");
    act(() => button("Create zone…")!.click());
    act(() => setValue(document.querySelector<HTMLInputElement>('[role="dialog"] input')!, "Deploy"));
    act(() => button("2 rows")!.click());
    act(() => button("Create")!.click());
    expect(h.createZone).toHaveBeenCalledWith("web", SNAPSHOT, { label: "Deploy", rows: 2, display: "footer" });
  });

  it("creates an unnamed 1-row header zone in the header by default", () => {
    open("header");
    act(() => button("Create zone…")!.click());
    act(() => button("Create")!.click());
    expect(h.createZone).toHaveBeenCalledWith("web", SNAPSHOT, { label: "", rows: 1, display: "header" });
  });
});
