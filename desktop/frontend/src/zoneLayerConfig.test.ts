import { describe, expect, it } from "vitest";
import YAML from "yaml";
import type { ActionsLayout } from "./types";
import {
  addLayerToDoc,
  layoutWithoutLayer,
  neighbourLayer,
  removeLayerFromDoc,
  setLayersInDoc,
} from "./zoneLayerConfig";

type Doc = ReturnType<typeof YAML.parseDocument>;

const edit = (yaml: string, mutate: (doc: Doc) => unknown) => {
  const doc = YAML.parseDocument(yaml);
  const result = mutate(doc);
  return { yaml: doc.toString(), result };
};

// The backend's sort_action_names: positioned first, then unpositioned, ties by key.
const byBackendOrder = (layers: Record<string, { position?: number } | null>) =>
  Object.keys(layers).sort((a, b) => {
    const pa = layers[a]?.position;
    const pb = layers[b]?.position;
    if (pa !== undefined && pb !== undefined) return pa - pb || a.localeCompare(b);
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return a.localeCompare(b);
  });

const plain = { name: "build", layers: [] };
const three = { name: "build", layers: [{ name: "a" }, { name: "b" }, { name: "c" }] };

describe("addLayerToDoc", () => {
  it("turns a zone without layers into two, the old buttons' layer first", () => {
    const { yaml, result } = edit("zones:\n  build:\n    rows: 1\n", (doc) => addLayerToDoc(doc, plain));
    expect(result).toBe("layer-2");
    expect(yaml).toBe(
      "zones:\n  build:\n    rows: 1\n    layers:\n      layer-1:\n        position: 1\n      layer-2:\n        position: 2\n",
    );
  });

  it("appends a named layer after the existing ones", () => {
    const before =
      "zones:\n  build:\n    rows: 1\n    layers:\n      layer-1:\n        position: 1\n      layer-2:\n        position: 2\n";
    const zone = { name: "build", layers: [{ name: "layer-1" }, { name: "layer-2" }] };
    const { yaml, result } = edit(before, (doc) => addLayerToDoc(doc, zone, " Mobile "));
    expect(result).toBe("mobile");
    expect(yaml).toBe(`${before}      mobile:\n        label: Mobile\n        position: 3\n`);
  });

  it("positions the new layer after the highest position in the file, not just the count", () => {
    const zone = { name: "build", layers: [{ name: "a" }, { name: "b" }] };
    const { yaml } = edit(
      "zones:\n  build:\n    layers:\n      a:\n        position: 10\n      b:\n        position: 20\n",
      (doc) => addLayerToDoc(doc, zone, "Web"),
    );
    expect(yaml).toContain("      web:\n        label: Web\n        position: 21\n");
  });

  it("writes no label for a blank one and keys it past every taken key", () => {
    const zone = { name: "build", layers: [{ name: "layer-1" }, { name: "layer-3" }] };
    const { yaml, result } = edit(
      "zones:\n  build:\n    layers:\n      layer-1:\n        position: 1\n      layer-3:\n        position: 2\n",
      (doc) => addLayerToDoc(doc, zone, "  "),
    );
    expect(result).toBe("layer-4");
    expect(yaml).toContain("      layer-4:\n        position: 3\n");
  });

  it("does not reuse a key another add already wrote to the file", () => {
    const { result } = edit("zones:\n  build:\n    layers:\n      layer-1: {}\n      layer-2: {}\n", (doc) =>
      addLayerToDoc(doc, plain),
    );
    expect(result).toBe("layer-3");
  });

  it("pins unpositioned layers first so the new one sorts last", () => {
    const zone = { name: "build", layers: [{ name: "a" }, { name: "b" }] };
    const { yaml, result } = edit("zones:\n  build:\n    layers:\n      a: {}\n      b: {}\n", (doc) =>
      addLayerToDoc(doc, zone),
    );
    const layers = YAML.parse(yaml).zones.build.layers;
    expect(byBackendOrder(layers)).toEqual(["a", "b", result]);
    expect(layers.a.position).toBe(1);
    expect(layers.b.position).toBe(2);
  });

  it("places the new layer after positions merged from another file", () => {
    const zone = {
      name: "build",
      layers: [
        { name: "a", position: 10 },
        { name: "b", position: 20 },
      ],
    };
    const { yaml, result } = edit("zones:\n  build:\n    rows: 1\n", (doc) => addLayerToDoc(doc, zone, "Web"));
    expect(result).toBe("web");
    expect(YAML.parse(yaml).zones.build.layers).toEqual({ web: { label: "Web", position: 21 } });
  });

  it("creates the zone entry with only layers when the file has none", () => {
    const { yaml } = edit("root: /tmp\n", (doc) => addLayerToDoc(doc, plain, "Web"));
    expect(yaml).toBe(
      "root: /tmp\nzones:\n  build:\n    layers:\n      layer-1:\n        position: 1\n      web:\n        label: Web\n        position: 2\n",
    );
  });
});

describe("setLayersInDoc", () => {
  const before =
    "zones:\n  build:\n    rows: 2\n    layers:\n      a:\n        label: A\n        position: 1\n      b:\n        position: 2\n      c:\n        position: 3\n";

  it("rewrites the layers in the drafts' order, renamed, with new ones keyed by name", () => {
    const { yaml, result } = edit(before, (doc) =>
      setLayersInDoc(doc, "build", [{ key: "c", label: "Cee" }, { label: "New" }, { key: "a", label: "" }], ["a", "b", "c"]),
    );
    expect(result).toEqual(["c", "new", "a"]);
    expect(yaml).toBe(
      "zones:\n  build:\n    rows: 2\n    layers:\n      c:\n        label: Cee\n        position: 1\n      new:\n        label: New\n        position: 2\n      a:\n        position: 3\n",
    );
  });

  it("keys unnamed new layers apart from each other and the taken keys", () => {
    const { result } = edit(before, (doc) =>
      setLayersInDoc(doc, "build", [{ key: "a", label: "" }, { label: "" }, { label: " " }], ["a", "b", "c"]),
    );
    expect(result).toEqual(["a", "layer-4", "layer-5"]);
  });

  it("creates the zone entry when the file has none", () => {
    const { yaml } = edit("root: /tmp\n", (doc) => setLayersInDoc(doc, "build", [{ label: "" }, { label: "" }], []));
    expect(yaml).toBe(
      "root: /tmp\nzones:\n  build:\n    layers:\n      layer-1:\n        position: 1\n      layer-2:\n        position: 2\n",
    );
  });
});

describe("removeLayerFromDoc", () => {
  it("drops the layer and keeps the rest", () => {
    const { yaml } = edit(
      "zones:\n  build:\n    rows: 1\n    layers:\n      a:\n        position: 1\n      b:\n        position: 2\n",
      (doc) => removeLayerFromDoc(doc, "build", "a"),
    );
    expect(yaml).toBe("zones:\n  build:\n    rows: 1\n    layers:\n      b:\n        position: 2\n");
  });

  it("drops layers once it empties", () => {
    const { yaml } = edit("zones:\n  build:\n    rows: 1\n    layers:\n      a:\n        position: 1\n", (doc) =>
      removeLayerFromDoc(doc, "build", "a"),
    );
    expect(yaml).toBe("zones:\n  build:\n    rows: 1\n");
  });

  it("drops a zone note left empty, and zones with it", () => {
    const { yaml } = edit("root: /tmp\nzones:\n  build:\n    layers:\n      a:\n        position: 3\n", (doc) =>
      removeLayerFromDoc(doc, "build", "a"),
    );
    expect(yaml).toBe("root: /tmp\n");
  });

  it("leaves a file without the zone alone", () => {
    expect(edit("root: /tmp\n", (doc) => removeLayerFromDoc(doc, "build", "a")).yaml).toBe("root: /tmp\n");
  });
});

describe("neighbourLayer", () => {
  it("is the next layer for the first one", () => {
    expect(neighbourLayer(three, "a")).toBe("b");
  });

  it("is the previous layer otherwise", () => {
    expect(neighbourLayer(three, "b")).toBe("a");
    expect(neighbourLayer(three, "c")).toBe("b");
  });

  it("is null for an only layer or an unknown one", () => {
    expect(neighbourLayer({ layers: [{ name: "a" }] }, "a")).toBeNull();
    expect(neighbourLayer(three, "zz")).toBeNull();
  });
});

describe("layoutWithoutLayer", () => {
  const layout: ActionsLayout = {
    header: ["test", "@zone/build"],
    footer: [],
    zones: { "build/a": ["ios"], "build/b": ["web", "docs"], "build/c": ["api"], other: ["x"] },
  };

  it("appends the layer's buttons to the previous layer's list", () => {
    expect(layoutWithoutLayer(layout, three, "c")).toEqual({
      ...layout,
      zones: { "build/a": ["ios"], "build/b": ["web", "docs", "api"], other: ["x"] },
    });
  });

  it("appends the first layer's buttons to the next one", () => {
    expect(layoutWithoutLayer(layout, three, "a").zones).toEqual({
      "build/b": ["web", "docs", "ios"],
      "build/c": ["api"],
      other: ["x"],
    });
  });

  it("leaves the layout as it was when the layer has no neighbour", () => {
    expect(layoutWithoutLayer(layout, { name: "build", layers: [{ name: "a" }] }, "a")).toEqual(layout);
  });

  it("does not change the layout it was given", () => {
    layoutWithoutLayer(layout, three, "b");
    expect(layout.zones["build/a"]).toEqual(["ios"]);
    expect(layout.zones["build/b"]).toEqual(["web", "docs"]);
  });
});
