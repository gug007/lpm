import { beforeEach, describe, expect, it, vi } from "vitest";
import YAML from "yaml";

// vi.mock hoists above any const, so shared state must come from vi.hoisted.
const h = vi.hoisted(() => ({
  reorderActions: vi.fn(),
  refreshProjects: vi.fn(),
  editProjectDoc: vi.fn(),
  editRepoDoc: vi.fn(),
  editGlobalDoc: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: h.toastError } }));
vi.mock("./store/app", () => ({
  useAppStore: {
    getState: () => ({ reorderActions: h.reorderActions, refreshProjects: h.refreshProjects }),
  },
}));
vi.mock("./yamlQueue", () => ({
  editProjectDoc: h.editProjectDoc,
  editRepoDoc: h.editRepoDoc,
  editGlobalDoc: h.editGlobalDoc,
}));

import { type ActionsModel, buildActionsModel } from "./actionsLayoutModel";
import { layoutWithoutZone, zoneItemId } from "./components/actionsDndLayout";
import type { ActionInfo, ActionsLayout, ZoneInfo } from "./types";
import { createZone, editZone, removeZone } from "./zoneActions";
import type { ActionsSnapshot } from "./zoneConfig";

const NAME = "app";
const LAYERS = ["project", "repo", "global"] as const;
type Layer = (typeof LAYERS)[number];
type Doc = ReturnType<typeof YAML.parseDocument>;

const editors = { project: h.editProjectDoc, repo: h.editRepoDoc, global: h.editGlobalDoc };

// The config files the edits land in, as text.
let files: Record<Layer, string>;

// yamlQueue's read, mutate, save round trip, run against `files`.
const editFile = (layer: Layer) => async (mutate: (doc: Doc) => void) => {
  const doc = YAML.parseDocument(files[layer] || "{}");
  mutate(doc);
  files[layer] = String(doc);
};

const saved = (layer: Layer) => YAML.parse(files[layer]);
const written = () => LAYERS.filter((layer) => editors[layer].mock.calls.length > 0);
const firstWrite = () =>
  Math.min(...LAYERS.flatMap((layer) => editors[layer].mock.invocationCallOrder));

const zone = (over: Partial<ZoneInfo> = {}): ZoneInfo => ({
  name: "build",
  label: "Build",
  rows: 1,
  source: "project",
  ...over,
});

const layout: ActionsLayout = {
  header: ["test", zoneItemId("build"), "lint"],
  footer: ["logs"],
  zones: { build: ["ios", "android"] },
};

const button = (name: string, display = "", position?: number): ActionInfo =>
  ({ name, label: name, cmd: `run ${name}`, confirm: false, display, position }) as ActionInfo;

const snapshotOf = (actions: ActionInfo[] = [], zones: ZoneInfo[] = []): ActionsSnapshot => ({
  actions,
  zones,
  layout: buildActionsModel(actions, zones).layout,
});

type Saved = { position?: number; rows?: number; label?: string; display?: "header" | "footer" };

// The rows as the app shows them once the project file is read back: the
// saved positions win over the shown ones, and a saved zone appears.
function reread(now: ActionsSnapshot): ActionsModel {
  const file = saved("project") as { actions?: Record<string, Saved>; zones?: Record<string, Saved> };
  const actions = now.actions.map((action) => ({ ...action, position: file.actions?.[action.name]?.position ?? action.position }));
  const zones = Object.entries(file.zones ?? {}).map(([name, entry]): ZoneInfo => {
    const before = now.zones.find((zone) => zone.name === name);
    return {
      name,
      label: entry.label ?? before?.label ?? name,
      rows: (entry.rows ?? before?.rows ?? 1) as ZoneInfo["rows"],
      display: entry.display ?? before?.display,
      position: entry.position ?? before?.position,
      source: "project",
    };
  });
  const others = now.zones.filter((zone) => !zones.some((entry) => entry.name === zone.name));
  return buildActionsModel(actions, [...others, ...zones]);
}

beforeEach(() => {
  files = { project: "", repo: "", global: "" };
  h.reorderActions.mockReset().mockResolvedValue(true);
  h.refreshProjects.mockReset().mockResolvedValue(undefined);
  h.toastError.mockReset();
  h.editProjectDoc.mockReset().mockImplementation((_name, mutate) => editFile("project")(mutate));
  h.editRepoDoc.mockReset().mockImplementation((_name, mutate) => editFile("repo")(mutate));
  h.editGlobalDoc.mockReset().mockImplementation(editFile("global"));
});

describe("createZone", () => {
  it("adds the zone to the project file with its height and spot", async () => {
    await createZone(NAME, snapshotOf(), { label: "", rows: 2, display: "header" });
    expect(written()).toEqual(["project"]);
    expect(saved("project")).toEqual({ zones: { zone: { rows: 2, position: 1 } } });
    expect(h.refreshProjects).toHaveBeenCalledTimes(1);
  });

  it("takes zone-2 when zone exists, even if another file declares it", async () => {
    await createZone(NAME, snapshotOf([], [zone({ name: "zone", source: "repo" })]), { label: "", rows: 1, display: "header" });
    expect(written()).toEqual(["project"]);
    expect(saved("project")).toEqual({ zones: { zone: { position: 1 }, "zone-2": { rows: 1, position: 2 } } });
  });

  it("keys a named footer zone after its name", async () => {
    await createZone(NAME, snapshotOf(), { label: "Deploy", rows: 2, display: "footer" });
    expect(saved("project")).toEqual({ zones: { deploy: { rows: 2, position: 1, display: "footer", label: "Deploy" } } });
  });

  it("puts a new header zone last when the header's buttons have no position", async () => {
    const now = snapshotOf([button("test"), button("lint"), button("deploy")]);
    await createZone(NAME, now, { label: "", rows: 1, display: "header" });
    expect(h.editProjectDoc).toHaveBeenCalledTimes(1);
    expect(written()).toEqual(["project"]);
    expect(saved("project")).toEqual({
      actions: { deploy: { position: 1 }, lint: { position: 2 }, test: { position: 3 } },
      zones: { zone: { rows: 1, position: 4 } },
    });
    expect(reread(now).layout.header).toEqual(["deploy", "lint", "test", zoneItemId("zone")]);
  });

  it("puts a new header zone last in a row that is partly numbered", async () => {
    const now = snapshotOf([button("x", "", 1), button("y", "", 2), button("lint"), button("test")]);
    await createZone(NAME, now, { label: "", rows: 1, display: "header" });
    expect(reread(now).layout.header).toEqual(["x", "y", "lint", "test", zoneItemId("zone")]);
  });

  it("puts a new footer zone last when the footer's buttons have no position", async () => {
    const now = snapshotOf([button("test"), button("logs", "footer"), button("shell", "footer")]);
    await createZone(NAME, now, { label: "", rows: 2, display: "footer" });
    expect(written()).toEqual(["project"]);
    expect(saved("project")).toEqual({
      actions: { logs: { position: 1 }, shell: { position: 2 } },
      zones: { zone: { rows: 2, display: "footer", position: 3 } },
    });
    const model = reread(now);
    expect(model.layout.footer).toEqual(["logs", "shell", zoneItemId("zone")]);
    expect(model.layout.header).toEqual(["test"]);
  });

  it("keeps the order of a row that already has zones", async () => {
    const now = snapshotOf(
      [button("test"), button("lint"), button("ios", "build")],
      [zone({ name: "build", source: "repo" })],
    );
    await createZone(NAME, now, { label: "", rows: 1, display: "header" });
    expect(reread(now).layout.header).toEqual([zoneItemId("build"), "lint", "test", zoneItemId("zone")]);
  });

  it("keeps both zones when two are created before the first one shows", async () => {
    const now = snapshotOf([button("test")]);
    await Promise.all([
      createZone(NAME, now, { label: "", rows: 1, display: "header" }),
      createZone(NAME, now, { label: "", rows: 3, display: "header" }),
    ]);
    expect(Object.keys(saved("project").zones)).toEqual(["zone", "zone-2"]);
    expect(saved("project").zones.zone.rows).toBe(1);
    expect(saved("project").zones["zone-2"].rows).toBe(3);
    expect(reread(now).layout.header).toEqual(["test", zoneItemId("zone"), zoneItemId("zone-2")]);
  });

  it("reports a failed write and still refreshes", async () => {
    h.editProjectDoc.mockRejectedValue(new Error("disk full"));
    await createZone(NAME, snapshotOf(), { label: "", rows: 1, display: "header" });
    expect(h.toastError).toHaveBeenCalledWith("Could not add the zone: disk full");
    expect(h.refreshProjects).toHaveBeenCalledTimes(1);
  });
});

describe("editZone", () => {
  it.each(LAYERS)("writes the name and height to the %s file for a zone declared there", async (source) => {
    files[source] = "zones:\n  build:\n    rows: 1\n    label: Build\n    position: 2\n";
    await editZone(NAME, zone({ source }), { label: "Builds", rows: 3 });
    expect(written()).toEqual([source]);
    expect(saved(source).zones.build).toEqual({ rows: 3, label: "Builds", position: 2 });
    expect(h.refreshProjects).toHaveBeenCalledTimes(1);
  });

  it("reports a failed write and still refreshes", async () => {
    h.editGlobalDoc.mockRejectedValue(new Error("read-only"));
    await editZone(NAME, zone({ source: "global" }), { label: "B", rows: 2 });
    expect(h.toastError).toHaveBeenCalledWith("Could not save the zone: read-only");
    expect(h.refreshProjects).toHaveBeenCalledTimes(1);
  });
});

describe("removeZone", () => {
  it("moves the buttons to the header from the layout they left, before any zone write", async () => {
    files.project = "root: /tmp\nzones:\n  build:\n    rows: 1\n";
    await removeZone(NAME, zone(), layout);
    expect(h.reorderActions).toHaveBeenCalledTimes(1);
    expect(h.reorderActions).toHaveBeenCalledWith(NAME, layoutWithoutZone(layout, "build"), layout);
    expect(h.reorderActions.mock.invocationCallOrder[0]).toBeLessThan(firstWrite());
    expect(written()).toEqual(["project"]);
    expect(h.editProjectDoc).toHaveBeenCalledTimes(1);
    expect(saved("project")).toEqual({ root: "/tmp" });
  });

  it("returns a footer zone's buttons to the footer at its spot", async () => {
    const footerLayout: ActionsLayout = {
      header: ["test"],
      footer: ["logs", zoneItemId("ship"), "tail"],
      zones: { ship: ["prod"] },
    };
    files.project = "zones:\n  ship:\n    rows: 2\n    display: footer\n";
    await removeZone(NAME, zone({ name: "ship", display: "footer" }), footerLayout);
    expect(h.reorderActions).toHaveBeenCalledWith(
      NAME,
      { header: ["test"], footer: ["logs", "prod", "tail"], zones: {} },
      footerLayout,
    );
    expect(saved("project")).toEqual({});
  });

  it("leaves the zone alone when its buttons could not move", async () => {
    h.reorderActions.mockResolvedValue(false);
    files.repo = "zones:\n  build:\n    rows: 1\n";
    await removeZone(NAME, zone({ source: "repo" }), layout);
    expect(written()).toEqual([]);
    expect(saved("repo")).toEqual({ zones: { build: { rows: 1 } } });
    // The store already told the user why the move failed.
    expect(h.toastError).not.toHaveBeenCalled();
    expect(h.refreshProjects).toHaveBeenCalledTimes(1);
  });

  it("removes a global zone from the global file and its note from the project file", async () => {
    files.global = "zones:\n  build:\n    rows: 2\n  docs:\n    rows: 1\n";
    files.project = "root: /tmp\nzones:\n  build:\n    position: 3\n";
    await removeZone(NAME, zone({ source: "global", rows: 2 }), layout);
    expect(h.reorderActions.mock.invocationCallOrder[0]).toBeLessThan(firstWrite());
    expect(written()).toEqual(["project", "global"]);
    expect(saved("global")).toEqual({ zones: { docs: { rows: 1 } } });
    expect(saved("project")).toEqual({ root: "/tmp" });
  });

  it("reports a failed write and still refreshes", async () => {
    h.editProjectDoc.mockRejectedValue(new Error("disk full"));
    await removeZone(NAME, zone(), layout);
    expect(h.toastError).toHaveBeenCalledWith("Could not remove the zone: disk full");
    expect(h.refreshProjects).toHaveBeenCalledTimes(1);
  });
});
