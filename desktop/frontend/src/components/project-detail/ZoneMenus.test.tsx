// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionsLayout, ZoneInfo } from "../../types";
import { zoneItemId } from "../actionsDndLayout";

const h = vi.hoisted(() => ({ editZone: vi.fn(), removeZone: vi.fn() }));
vi.mock("../../zoneActions", () => ({ editZone: h.editZone, removeZone: h.removeZone }));

import { ZoneMenus } from "./ZoneMenus";

const PEER_PROJECT = "peer-0123abcd-web";
const zone = (over: Partial<ZoneInfo> = {}): ZoneInfo => ({
  name: "build",
  label: "Build",
  rows: 1,
  source: "project",
  ...over,
});
const layoutFor = (z: ZoneInfo): ActionsLayout => ({
  header: z.display === "footer" ? [] : [zoneItemId(z.name)],
  footer: z.display === "footer" ? [zoneItemId(z.name)] : [],
  zones: { [z.name]: [] },
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  h.editZone.mockReset();
  h.removeZone.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

function open(projectName: string, z: ZoneInfo) {
  act(() => root.render(<ZoneMenus projectName={projectName} layout={layoutFor(z)} menu={{ x: 1, y: 2, zone: z }} onClose={() => {}} />));
}

function setValue(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("ZoneMenus", () => {
  it.each(["repo", "global"] as const)("keeps a peer project's %s zone read-only", (source) => {
    open(PEER_PROJECT, zone({ source }));
    expect([button("Edit zone…")?.disabled, button("Remove zone")?.disabled]).toEqual([true, true]);
  });

  it("lets a peer project edit its own zone", () => {
    open(PEER_PROJECT, zone());
    expect([button("Edit zone…")?.disabled, button("Remove zone")?.disabled]).toEqual([false, false]);
  });

  it.each(["project", "repo", "global"] as const)("lets a local project edit its %s zone", (source) => {
    open("web", zone({ source }));
    expect([button("Edit zone…")?.disabled, button("Remove zone")?.disabled]).toEqual([false, false]);
  });

  it("edits the name and height through the zone dialog", () => {
    const ship = zone({ name: "ship", label: "Ship", rows: 2, display: "footer" });
    open("web", ship);
    act(() => button("Edit zone…")!.click());
    const name = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
    expect(name.value).toBe("Ship");
    expect(button("2 rows")?.getAttribute("aria-pressed")).toBe("true");
    act(() => button("3 rows")!.click());
    act(() => button("Save")!.click());
    expect(h.editZone).toHaveBeenCalledWith("web", ship, { label: "Ship", rows: 3 });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("saves a changed name on its own", () => {
    const z = zone({ rows: 2 });
    open("web", z);
    act(() => button("Edit zone…")!.click());
    act(() => setValue(document.querySelector<HTMLInputElement>('[role="dialog"] input')!, " Builds "));
    act(() => button("Save")!.click());
    expect(h.editZone).toHaveBeenCalledWith("web", z, { label: "Builds", rows: 2 });
  });

  it.each([
    { what: "a named zone", z: zone({ source: "repo", display: "footer" }) },
    { what: "a zone known only by its key", z: zone({ name: "zone-2", label: "zone-2" }) },
  ])("writes nothing when Save changes nothing in $what", ({ z }) => {
    open("web", z);
    act(() => button("Edit zone…")!.click());
    act(() => button("Save")!.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(h.editZone).not.toHaveBeenCalled();
  });

  it("writes nothing when the dialog is cancelled", () => {
    open("web", zone());
    act(() => button("Edit zone…")!.click());
    act(() => button("Cancel")!.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(h.editZone).not.toHaveBeenCalled();
  });

  it("closes the dialog when an external edit removes the zone", () => {
    open("web", zone());
    act(() => button("Edit zone…")!.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    act(() =>
      root.render(<ZoneMenus projectName="web" layout={{ header: [], footer: [], zones: {} }} menu={null} onClose={() => {}} />),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(h.editZone).not.toHaveBeenCalled();
  });

  it("leaves Name empty for a zone known only by its key", () => {
    open("web", zone({ name: "zone-2", label: "zone-2" }));
    act(() => button("Edit zone…")!.click());
    const name = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
    expect(name.value).toBe("");
    expect(name.placeholder).toBe("zone-2");
  });

  it("removes a project zone without asking", () => {
    const z = zone();
    open("web", z);
    act(() => button("Remove zone")!.click());
    expect(h.removeZone).toHaveBeenCalledWith("web", z, layoutFor(z));
  });

  it("asks before removing a shared header zone and says its buttons go back to the header", () => {
    open("web", zone({ source: "repo" }));
    act(() => button("Remove zone")!.click());
    expect(h.removeZone).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("their buttons move back to the header");
  });

  it("asks before removing a shared footer zone and says other projects show its buttons in the header", () => {
    open("web", zone({ source: "global", display: "footer" }));
    act(() => button("Remove zone")!.click());
    expect(h.removeZone).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      "this project's buttons move back to the footer and other projects show theirs in the header",
    );
  });
});
