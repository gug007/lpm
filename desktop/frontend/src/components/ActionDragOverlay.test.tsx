// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ActionInfo, ZoneInfo } from "../types";
import { buildActionsModel } from "../actionsLayoutModel";
import { ActionDragOverlay } from "./ActionDragOverlay";
import { type ActionGroup, zoneItemId } from "./actionsDndLayout";

const action = (name: string, display: string, position?: number): ActionInfo =>
  ({ name, label: name, cmd: `run ${name}`, confirm: false, display, position }) as ActionInfo;
const zones: ZoneInfo[] = [
  { name: "tools", label: "Tools", rows: 2, position: 1, source: "project" },
  { name: "ship", label: "Ship", rows: 2, position: 2, display: "footer", source: "project" },
];
const actions = [action("ios", "tools"), action("prod", "ship"), action("lint", "", 2), action("logs", "footer", 1)];
const model = buildActionsModel(actions, zones);

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

function overlay(id: string, overGroup: ActionGroup | null): HTMLElement {
  act(() => root.render(<ActionDragOverlay id={id} overGroup={overGroup} actions={actions} model={model} scope="t" />));
  return container.firstElementChild as HTMLElement;
}

describe("ActionDragOverlay", () => {
  it("draws a dragged zone at the size of the row it is over", () => {
    expect(overlay(zoneItemId("tools"), "footer").style.height).toBe("57px");
    expect(overlay(zoneItemId("tools"), "header").style.height).toBe("72px");
    expect(overlay(zoneItemId("ship"), "header").style.height).toBe("72px");
  });

  it("keeps a zone's own row while it is over nothing", () => {
    expect(overlay(zoneItemId("ship"), null).style.height).toBe("57px");
    expect(overlay(zoneItemId("tools"), null).style.height).toBe("72px");
  });

  it("draws a footer zone's buttons in the footer's colours", () => {
    expect(overlay(zoneItemId("ship"), "footer").querySelector("button")?.className).toContain("--composer-border");
  });

  it("sizes a button over a zone like that zone's buttons", () => {
    const overShip = overlay("lint", "zone:ship");
    expect(overShip.style.height).toBe("21.5px");
    expect(overShip.querySelector("button")?.className).toContain("--composer-border");
    expect(overlay("lint", "zone:tools").style.height).toBe("29px");
  });
});
