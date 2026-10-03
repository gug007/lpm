// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionsLayout, ZoneInfo } from "../../types";
import { zoneItemId } from "../actionsDndLayout";

const h = vi.hoisted(() => ({
  editZone: vi.fn(),
  removeZone: vi.fn(),
  addLayer: vi.fn(),
  removeLayer: vi.fn(),
  saveLayers: vi.fn(),
}));
vi.mock("../../zoneActions", () => ({ editZone: h.editZone, removeZone: h.removeZone }));
// The real zoneLayerActions pulls in the app store, which needs the Tauri window.
vi.mock("../../store/app", () => ({ useAppStore: {} }));
vi.mock("../../yamlQueue", () => ({}));
vi.mock("../../zoneLayerActions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../zoneLayerActions")>()),
  addLayer: h.addLayer,
  removeLayer: h.removeLayer,
  saveLayers: h.saveLayers,
}));

import { useZoneLayers } from "../../store/zoneLayers";
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
  for (const fn of Object.values(h)) fn.mockReset();
  useZoneLayers.setState({ open: {} });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
const field = (label: string) => document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
const layered = (over: Partial<ZoneInfo> = {}) =>
  zone({ layers: [{ name: "dev", label: "Dev", position: 1 }, { name: "ops", position: 2 }], ...over });

async function save() {
  await act(async () => button("Save")!.click());
}

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

  it("edits the name and height through the zone dialog", async () => {
    const ship = zone({ name: "ship", label: "Ship", rows: 2, display: "footer" });
    open("web", ship);
    act(() => button("Edit zone…")!.click());
    const name = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
    expect(name.value).toBe("Ship");
    expect(button("2 rows")?.getAttribute("aria-pressed")).toBe("true");
    act(() => button("3 rows")!.click());
    await save();
    expect(h.editZone).toHaveBeenCalledWith("web", ship, { label: "Ship", rows: 3 });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("saves a changed name on its own", async () => {
    const z = zone({ rows: 2 });
    open("web", z);
    act(() => button("Edit zone…")!.click());
    act(() => setValue(document.querySelector<HTMLInputElement>('[role="dialog"] input')!, " Builds "));
    await save();
    expect(h.editZone).toHaveBeenCalledWith("web", z, { label: "Builds", rows: 2 });
    expect(h.saveLayers).not.toHaveBeenCalled();
  });

  it.each([
    { what: "a named zone", z: zone({ source: "repo", display: "footer" }) },
    { what: "a zone known only by its key", z: zone({ name: "zone-2", label: "zone-2" }) },
    { what: "a zone with layers", z: layered() },
  ])("writes nothing when Save changes nothing in $what", async ({ z }) => {
    open("web", z);
    act(() => button("Edit zone…")!.click());
    await save();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(h.editZone).not.toHaveBeenCalled();
    expect(h.saveLayers).not.toHaveBeenCalled();
  });

  it("saves edited layers without touching the name and height", async () => {
    const z = layered();
    open("web", z);
    act(() => button("Edit zone…")!.click());
    expect([field("Layer 1 name").value, field("Layer 2 name").value]).toEqual(["Dev", ""]);
    act(() => setValue(field("Layer 2 name"), "Ops"));
    act(() => button("Add layer")!.click());
    await save();
    expect(h.editZone).not.toHaveBeenCalled();
    expect(h.saveLayers).toHaveBeenCalledWith(
      "web",
      z,
      [{ key: "dev", label: "Dev" }, { key: "ops", label: "Ops" }, { label: "" }],
      layoutFor(z),
    );
  });

  it("saves the name and the layers together", async () => {
    const z = zone();
    open("web", z);
    act(() => button("Edit zone…")!.click());
    act(() => setValue(document.querySelector<HTMLInputElement>('[role="dialog"] input')!, "Builds"));
    act(() => button("Add layer")!.click());
    await save();
    expect(h.editZone).toHaveBeenCalledWith("web", z, { label: "Builds", rows: 1 });
    expect(h.saveLayers).toHaveBeenCalledWith("web", z, [{ label: "" }, { label: "" }], layoutFor(z));
  });

  it("writes no layers when an edit lands back where it started", async () => {
    open("web", layered());
    act(() => button("Edit zone…")!.click());
    act(() => setValue(field("Layer 2 name"), "Ops"));
    act(() => setValue(field("Layer 2 name"), " "));
    await save();
    expect(h.saveLayers).not.toHaveBeenCalled();
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

  it("offers New layer but not Remove layer on a zone with fewer than two layers", () => {
    open("web", zone({ layers: [{ name: "dev" }] }));
    expect(button("New layer")?.disabled).toBe(false);
    expect([...document.querySelectorAll("button")].some((b) => b.textContent?.includes("Remove layer"))).toBe(false);
  });

  it("orders the zone menu", () => {
    open("web", layered());
    const labels = [...document.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(labels).toEqual(["New layer", "Edit zone…", "Remove layer “Dev”", "Remove zone"]);
  });

  it("names the open layer in Remove layer when it has a label", () => {
    open("web", layered());
    expect(button("Remove layer “Dev”")).toBeDefined();
    act(() => useZoneLayers.getState().setOpen("web", "build", "ops"));
    expect(button("Remove layer")).toBeDefined();
  });

  it.each(["repo", "global"] as const)("keeps New layer and Remove layer off a peer project's %s zone", (source) => {
    open(PEER_PROJECT, layered({ source }));
    expect([button("New layer")?.disabled, button("Remove layer “Dev”")?.disabled]).toEqual([true, true]);
  });

  it("adds a layer", () => {
    const z = zone();
    open("web", z);
    act(() => button("New layer")!.click());
    expect(h.addLayer).toHaveBeenCalledWith("web", z);
  });

  it("removes the open layer of a project zone without asking", () => {
    const z = layered();
    useZoneLayers.getState().setOpen("web", "build", "ops");
    open("web", z);
    act(() => button("Remove layer")!.click());
    expect(h.removeLayer).toHaveBeenCalledWith("web", z, "ops", layoutFor(z));
  });

  it.each(["repo", "global"] as const)("asks before removing a layer of a shared %s zone", (source) => {
    const z = layered({ source });
    open("web", z);
    act(() => button("Remove layer “Dev”")!.click());
    expect(h.removeLayer).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Remove shared layer?");
    act(() => button("Remove")!.click());
    expect(h.removeLayer).toHaveBeenCalledWith("web", z, "dev", layoutFor(z));
  });

  it("saves a project zone's removed layer without asking", async () => {
    const z = layered();
    open("web", z);
    act(() => button("Edit zone…")!.click());
    act(() => document.querySelector<HTMLButtonElement>('[aria-label="Remove layer 2"]')!.click());
    await save();
    expect(document.body.textContent).not.toContain("Remove shared layer");
    expect(h.saveLayers).toHaveBeenCalledWith("web", z, [{ key: "dev", label: "Dev" }], layoutFor(z));
  });

  it.each(["repo", "global"] as const)("asks before saving a shared %s zone with a layer removed", async (source) => {
    const z = layered({ source });
    open("web", z);
    act(() => button("Edit zone…")!.click());
    act(() => setValue(document.querySelector<HTMLInputElement>('[role="dialog"] input')!, "Builds"));
    act(() => document.querySelector<HTMLButtonElement>('[aria-label="Remove layer 2"]')!.click());
    await save();
    expect(h.editZone).not.toHaveBeenCalled();
    expect(h.saveLayers).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Remove shared layer?");
    expect(document.body.textContent).toContain("ops is a layer of Build");
    await act(async () => button("Remove")!.click());
    expect(h.editZone).toHaveBeenCalledWith("web", z, { label: "Builds", rows: 1 });
    expect(h.saveLayers).toHaveBeenCalledWith("web", z, [{ key: "dev", label: "Dev" }], layoutFor(z));
  });

  it("names every removed layer of a shared zone and writes nothing when cancelled", async () => {
    const z = zone({
      source: "repo",
      layers: [{ name: "dev", label: "Dev" }, { name: "ops" }, { name: "qa", label: "QA" }],
    });
    open("web", z);
    act(() => button("Edit zone…")!.click());
    act(() => document.querySelector<HTMLButtonElement>('[aria-label="Remove layer 3"]')!.click());
    act(() => document.querySelector<HTMLButtonElement>('[aria-label="Remove layer 1"]')!.click());
    await save();
    expect(document.body.textContent).toContain("Remove shared layers?");
    expect(document.body.textContent).toContain("Dev and QA are layers of Build");
    act(() => button("Cancel")!.click());
    expect(h.saveLayers).not.toHaveBeenCalled();
    expect(h.editZone).not.toHaveBeenCalled();
  });

  it("saves a shared zone without asking when no layer is removed", async () => {
    const z = layered({ source: "repo" });
    open("web", z);
    act(() => button("Edit zone…")!.click());
    act(() => button("Add layer")!.click());
    await save();
    expect(document.body.textContent).not.toContain("Remove shared layer");
    expect(h.saveLayers).toHaveBeenCalled();
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
