import YAML from "yaml";
import type { ActionsLayout, ZoneInfo } from "./types";
import { layerKeyFor, layersOf, zoneListKey } from "./zoneLayers";

type Doc = ReturnType<typeof YAML.parseDocument>;

// A draft without a key is a layer the editor added.
export interface LayerDraft {
  key?: string;
  label: string;
}

const FIRST_LAYER = "layer-1";

function zoneEntryOf(doc: Doc, zone: string, create: boolean): YAML.YAMLMap | null {
  const entry = doc.getIn(["zones", zone], true);
  if (YAML.isMap(entry)) return entry;
  if (!create) return null;
  const zones = doc.get("zones", true);
  if (YAML.isMap(zones)) zones.set(zone, doc.createNode({}));
  else doc.set("zones", doc.createNode({ [zone]: {} }));
  const created = doc.getIn(["zones", zone], true);
  return YAML.isMap(created) ? created : null;
}

function layersMapOf(entry: YAML.YAMLMap | null): YAML.YAMLMap | null {
  const layers = entry?.get("layers", true);
  return YAML.isMap(layers) ? layers : null;
}

function keysOf(map: YAML.YAMLMap | null): string[] {
  return (map?.items ?? []).flatMap((item) => (YAML.isScalar(item.key) ? [String(item.key.value)] : []));
}

function positionOf(layer: unknown): number | undefined {
  const position = YAML.isMap(layer) ? layer.get("position") : undefined;
  return typeof position === "number" ? position : undefined;
}

function highestPosition(map: YAML.YAMLMap): number {
  return Math.max(0, ...map.items.map((item) => positionOf(item.value) ?? 0));
}

function layerEntry(label: string, position: number): Record<string, unknown> {
  const trimmed = label.trim();
  return trimmed ? { label: trimmed, position } : { position };
}

function setLayerPosition(doc: Doc, layers: YAML.YAMLMap, key: string, position: number): void {
  const layer = layers.get(key, true);
  if (YAML.isMap(layer)) layer.set("position", position);
  else layers.set(key, doc.createNode({ position }));
}

// A zone without layers already holds buttons; they become its first layer,
// so the new layer is the second. Keys already in the file count as taken:
// two adds can start from the same render. Unpositioned layers sort after
// positioned ones, so a positioned new layer would become the first and pull
// in every button without a `layer`; they get positions past the highest one
// (in this file or merged from another) in their shown order before the add.
export function addLayerToDoc(doc: Doc, zone: Pick<ZoneInfo, "name" | "layers">, label = ""): string {
  const entry = zoneEntryOf(doc, zone.name, true);
  if (!entry) return "";
  let layers = layersMapOf(entry);
  if (!layers) {
    entry.set("layers", doc.createNode({}));
    layers = layersMapOf(entry)!;
  }
  const shownLayers = layersOf(zone);
  const shown = shownLayers.map((layer) => layer.name);
  if (shown.length === 0 && !layers.has(FIRST_LAYER)) layers.set(FIRST_LAYER, doc.createNode({ position: 1 }));
  let top = Math.max(highestPosition(layers), ...shownLayers.map((layer) => layer.position ?? 0));
  for (const layer of shownLayers) {
    const known = layer.position ?? positionOf(layers.get(layer.name, true));
    if (known === undefined) setLayerPosition(doc, layers, layer.name, ++top);
  }
  const taken = [...new Set([...(shown.length === 0 ? [FIRST_LAYER] : shown), ...keysOf(layers)])];
  const key = layerKeyFor(label, taken);
  layers.set(key, doc.createNode(layerEntry(label, Math.max(top, taken.length) + 1)));
  return key;
}

export function setLayersInDoc(doc: Doc, zone: string, drafts: LayerDraft[], taken: string[]): string[] {
  const entry = zoneEntryOf(doc, zone, true);
  if (!entry) return [];
  const chosen = drafts.flatMap((draft) => (draft.key ? [draft.key] : []));
  const used = new Set([...taken, ...keysOf(layersMapOf(entry)), ...chosen]);
  const keys = drafts.map((draft) => {
    if (draft.key) return draft.key;
    const key = layerKeyFor(draft.label, [...used]);
    used.add(key);
    return key;
  });
  if (keys.length === 0) {
    entry.delete("layers");
    return keys;
  }
  const layers = Object.fromEntries(keys.map((key, i) => [key, layerEntry(drafts[i].label, i + 1)]));
  entry.set("layers", doc.createNode(layers));
  return keys;
}

// A zone entry left empty is a project file's note for a zone declared
// elsewhere; the declaring file's entry always keeps its rows.
export function removeLayerFromDoc(doc: Doc, zone: string, layer: string): void {
  const entry = zoneEntryOf(doc, zone, false);
  const layers = layersMapOf(entry);
  if (!entry || !layers) return;
  layers.delete(layer);
  if (layers.items.length === 0) entry.delete("layers");
  if (entry.items.length > 0) return;
  const zones = doc.get("zones", true);
  if (!YAML.isMap(zones)) return;
  zones.delete(zone);
  if (zones.items.length === 0) doc.delete("zones");
}

export function neighbourLayer(zone: Pick<ZoneInfo, "layers">, layer: string): string | null {
  const layers = layersOf(zone);
  const at = layers.findIndex((candidate) => candidate.name === layer);
  if (at === -1) return null;
  return (at > 0 ? layers[at - 1] : layers[at + 1])?.name ?? null;
}

export function layoutWithoutLayer(
  layout: ActionsLayout,
  zone: Pick<ZoneInfo, "name" | "layers">,
  layer: string,
): ActionsLayout {
  const neighbour = neighbourLayer(zone, layer);
  if (!neighbour) return layout;
  const key = zoneListKey(zone.name, layer);
  const target = zoneListKey(zone.name, neighbour);
  const zones = { ...layout.zones };
  const moving = zones[key] ?? [];
  delete zones[key];
  zones[target] = [...(zones[target] ?? []), ...moving];
  return { ...layout, zones };
}
