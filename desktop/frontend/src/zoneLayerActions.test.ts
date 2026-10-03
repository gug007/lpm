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
  setOpen: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: h.toastError } }));
vi.mock("./store/app", () => ({
  useAppStore: {
    getState: () => ({ reorderActions: h.reorderActions, refreshProjects: h.refreshProjects }),
  },
}));
vi.mock("./store/zoneLayers", () => ({
  useZoneLayers: { getState: () => ({ setOpen: h.setOpen }) },
}));
vi.mock("./yamlQueue", () => ({
  editProjectDoc: h.editProjectDoc,
  editRepoDoc: h.editRepoDoc,
  editGlobalDoc: h.editGlobalDoc,
}));

import type { ActionsLayout, ZoneInfo } from "./types";
import { addLayer, layersUnchanged, removeLayer, saveLayers } from "./zoneLayerActions";

const NAME = "app";
const FILES = ["project", "repo", "global"] as const;
type File = (typeof FILES)[number];
type Doc = ReturnType<typeof YAML.parseDocument>;

const editors = { project: h.editProjectDoc, repo: h.editRepoDoc, global: h.editGlobalDoc };

let files: Record<File, string>;

const editFile = (file: File) => async (mutate: (doc: Doc) => void) => {
  const doc = YAML.parseDocument(files[file] || "{}");
  mutate(doc);
  files[file] = String(doc);
};

const saved = (file: File) => YAML.parse(files[file]);
const written = () => FILES.filter((file) => editors[file].mock.calls.length > 0);
const firstWrite = () => Math.min(...FILES.flatMap((file) => editors[file].mock.invocationCallOrder));

const zone = (over: Partial<ZoneInfo> = {}): ZoneInfo => ({
  name: "build",
  label: "Build",
  rows: 1,
  source: "project",
  layers: [{ name: "a", label: "A", position: 1 }, { name: "b", position: 2 }, { name: "c", position: 3 }],
  ...over,
});

const LAYERED =
  "zones:\n  build:\n    rows: 1\n    layers:\n      a:\n        label: A\n        position: 1\n      b:\n        position: 2\n      c:\n        position: 3\n";

const layout: ActionsLayout = {
  header: ["test", "@zone/build"],
  footer: [],
  zones: { "build/a": ["ios"], "build/b": ["web"], "build/c": ["api"] },
};

beforeEach(() => {
  files = { project: "", repo: "", global: "" };
  h.reorderActions.mockReset().mockResolvedValue(true);
  h.refreshProjects.mockReset().mockResolvedValue(undefined);
  h.toastError.mockReset();
  h.setOpen.mockReset();
  h.editProjectDoc.mockReset().mockImplementation((_name, mutate) => editFile("project")(mutate));
  h.editRepoDoc.mockReset().mockImplementation((_name, mutate) => editFile("repo")(mutate));
  h.editGlobalDoc.mockReset().mockImplementation(editFile("global"));
});

describe("addLayer", () => {
  it.each(FILES)("writes to the %s file declaring the zone, refreshes, then opens the new layer", async (source) => {
    files[source] = "zones:\n  build:\n    rows: 1\n";
    await addLayer(NAME, zone({ source, layers: [] }), "Mobile");
    expect(written()).toEqual([source]);
    expect(saved(source).zones.build.layers).toEqual({ "layer-1": { position: 1 }, mobile: { label: "Mobile", position: 2 } });
    expect(h.setOpen).toHaveBeenCalledWith(NAME, "build", "mobile");
    expect(h.refreshProjects.mock.invocationCallOrder[0]).toBeLessThan(h.setOpen.mock.invocationCallOrder[0]);
  });

  it("reports a failed write, refreshes and opens nothing", async () => {
    h.editProjectDoc.mockRejectedValue(new Error("disk full"));
    await addLayer(NAME, zone());
    expect(h.toastError).toHaveBeenCalledWith("Could not add the layer: disk full");
    expect(h.refreshProjects).toHaveBeenCalledTimes(1);
    expect(h.setOpen).not.toHaveBeenCalled();
  });
});

describe("removeLayer", () => {
  it("moves the buttons to the previous layer before deleting the entry, then opens it", async () => {
    files.project = LAYERED;
    await removeLayer(NAME, zone(), "c", layout);
    expect(h.reorderActions).toHaveBeenCalledWith(
      NAME,
      { ...layout, zones: { "build/a": ["ios"], "build/b": ["web", "api"] } },
      layout,
    );
    expect(h.reorderActions.mock.invocationCallOrder[0]).toBeLessThan(firstWrite());
    expect(written()).toEqual(["project"]);
    expect(Object.keys(saved("project").zones.build.layers)).toEqual(["a", "b"]);
    expect(h.setOpen).toHaveBeenCalledWith(NAME, "build", "b");
    expect(h.refreshProjects).toHaveBeenCalledTimes(1);
  });

  it("does nothing for a zone with one layer", async () => {
    await removeLayer(NAME, zone({ layers: [{ name: "a" }] }), "a", layout);
    expect(h.reorderActions).not.toHaveBeenCalled();
    expect(written()).toEqual([]);
    expect(h.setOpen).not.toHaveBeenCalled();
  });

  it("leaves the layer alone when its buttons could not move", async () => {
    h.reorderActions.mockResolvedValue(false);
    files.project = LAYERED;
    await removeLayer(NAME, zone(), "a", layout);
    expect(written()).toEqual([]);
    expect(h.toastError).not.toHaveBeenCalled();
    expect(h.setOpen).not.toHaveBeenCalled();
    expect(h.refreshProjects).toHaveBeenCalledTimes(1);
  });

  it("removes a repo layer from the repo file and its note from the project file", async () => {
    files.repo = LAYERED;
    files.project = "root: /tmp\nzones:\n  build:\n    layers:\n      a:\n        position: 4\n";
    await removeLayer(NAME, zone({ source: "repo" }), "a", layout);
    expect(h.reorderActions.mock.invocationCallOrder[0]).toBeLessThan(firstWrite());
    expect(Object.keys(saved("repo").zones.build.layers)).toEqual(["b", "c"]);
    expect(saved("project")).toEqual({ root: "/tmp" });
    expect(h.setOpen).toHaveBeenCalledWith(NAME, "build", "b");
  });

  it("reports a failed write and still refreshes", async () => {
    h.editGlobalDoc.mockRejectedValue(new Error("read-only"));
    await removeLayer(NAME, zone({ source: "global" }), "b", layout);
    expect(h.toastError).toHaveBeenCalledWith("Could not remove the layer: read-only");
    expect(h.refreshProjects).toHaveBeenCalledTimes(1);
    expect(h.setOpen).not.toHaveBeenCalled();
  });
});

describe("layersUnchanged", () => {
  it("is true for the zone's own layers, ignoring label whitespace", () => {
    expect(layersUnchanged(zone(), [{ key: "a", label: " A " }, { key: "b", label: "" }, { key: "c", label: "" }])).toBe(true);
  });

  it("is false after a rename, a reorder, a removal or an addition", () => {
    const a = { key: "a", label: "A" };
    const b = { key: "b", label: "" };
    const c = { key: "c", label: "" };
    expect(layersUnchanged(zone(), [{ ...a, label: "Aye" }, b, c])).toBe(false);
    expect(layersUnchanged(zone(), [b, a, c])).toBe(false);
    expect(layersUnchanged(zone(), [a, b])).toBe(false);
    expect(layersUnchanged(zone(), [a, b, c, { label: "" }])).toBe(false);
  });
});

describe("saveLayers", () => {
  it("writes nothing for an unchanged list", async () => {
    files.project = LAYERED;
    await saveLayers(NAME, zone(), [{ key: "a", label: "A" }, { key: "b", label: "" }, { key: "c", label: "" }], layout);
    expect(h.reorderActions).not.toHaveBeenCalled();
    expect(written()).toEqual([]);
  });

  it("renames, reorders and adds in one write to the source without moving buttons", async () => {
    files.repo = LAYERED;
    await saveLayers(
      NAME,
      zone({ source: "repo" }),
      [{ key: "c", label: "Cee" }, { key: "a", label: "A" }, { key: "b", label: "" }, { label: "" }],
      layout,
    );
    expect(h.reorderActions).not.toHaveBeenCalled();
    expect(h.editRepoDoc).toHaveBeenCalledTimes(1);
    expect(saved("project").zones).toBeUndefined();
    expect(saved("repo").zones.build.layers).toEqual({
      c: { label: "Cee", position: 1 },
      a: { label: "A", position: 2 },
      b: { position: 3 },
      "layer-4": { position: 4 },
    });
    expect(h.refreshProjects).toHaveBeenCalledTimes(1);
  });

  it("drops the project file's notes on a repo zone's layers so they cannot override the new order", async () => {
    files.repo = LAYERED;
    files.project = "root: /tmp\nzones:\n  build:\n    layers:\n      a:\n        position: 4\n";
    await saveLayers(
      NAME,
      zone({ source: "repo" }),
      [{ key: "c", label: "" }, { key: "a", label: "A" }, { key: "b", label: "" }],
      layout,
    );
    expect(saved("repo").zones.build.layers).toEqual({
      c: { position: 1 },
      a: { label: "A", position: 2 },
      b: { position: 3 },
    });
    expect(saved("project")).toEqual({ root: "/tmp" });
  });

  it("moves removed layers' buttons to the layers that remain, in one move, before the write", async () => {
    files.project = LAYERED;
    await saveLayers(NAME, zone(), [{ key: "c", label: "" }], layout);
    expect(h.reorderActions).toHaveBeenCalledTimes(1);
    expect(h.reorderActions).toHaveBeenCalledWith(NAME, { ...layout, zones: { "build/c": ["api", "ios", "web"] } }, layout);
    expect(h.reorderActions.mock.invocationCallOrder[0]).toBeLessThan(firstWrite());
    expect(saved("project").zones.build.layers).toEqual({ c: { position: 1 } });
  });

  it("writes nothing when the buttons could not move", async () => {
    h.reorderActions.mockResolvedValue(false);
    files.project = LAYERED;
    await saveLayers(NAME, zone(), [{ key: "a", label: "A" }], layout);
    expect(written()).toEqual([]);
    expect(h.refreshProjects).toHaveBeenCalledTimes(1);
  });

  it("reports a failed write and still refreshes", async () => {
    h.editProjectDoc.mockRejectedValue(new Error("disk full"));
    await saveLayers(NAME, zone(), [{ key: "a", label: "Renamed" }, { key: "b", label: "" }, { key: "c", label: "" }], layout);
    expect(h.toastError).toHaveBeenCalledWith("Could not save the layers: disk full");
    expect(h.refreshProjects).toHaveBeenCalledTimes(1);
  });
});
