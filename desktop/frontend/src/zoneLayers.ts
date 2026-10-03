import type { ActionsLayout, LayerInfo, ZoneInfo } from "./types";
import { slugify } from "./slugify";
import { uniqueKey } from "./uniqueKey";

// Each layer of a zone is its own button list, keyed zone/layer; a zone
// without layers keeps its name as its only key. Neither part holds a "/".
export const LAYER_SEPARATOR = "/";

export function zoneListKey(zone: string, layer?: string | null): string {
  return layer ? `${zone}${LAYER_SEPARATOR}${layer}` : zone;
}

export function zoneOfListKey(key: string): string {
  const at = key.indexOf(LAYER_SEPARATOR);
  return at === -1 ? key : key.slice(0, at);
}

export function layerOfListKey(key: string): string | null {
  const at = key.indexOf(LAYER_SEPARATOR);
  return at === -1 ? null : key.slice(at + LAYER_SEPARATOR.length);
}

export function layersOf(zone: Pick<ZoneInfo, "layers">): LayerInfo[] {
  return zone.layers ?? [];
}

export function hasPager(zone: Pick<ZoneInfo, "layers">): boolean {
  return layersOf(zone).length >= 2;
}

export function listKeysOfZone(zone: Pick<ZoneInfo, "name" | "layers">): string[] {
  const layers = layersOf(zone);
  return layers.length === 0 ? [zone.name] : layers.map((layer) => zoneListKey(zone.name, layer.name));
}

export function listKeyForAction(zone: Pick<ZoneInfo, "name" | "layers">, layer: string | undefined): string {
  const layers = layersOf(zone);
  if (layers.length === 0) return zone.name;
  const found = layers.find((candidate) => candidate.name === layer) ?? layers[0];
  return zoneListKey(zone.name, found.name);
}

export function listKeysInLayout(layout: ActionsLayout, zone: string): string[] {
  return Object.keys(layout.zones).filter((key) => zoneOfListKey(key) === zone);
}

export function layoutHasZone(layout: ActionsLayout, zone: string): boolean {
  return listKeysInLayout(layout, zone).length > 0;
}

export function layerKeyFor(label: string, taken: string[]): string {
  const slug = slugify(label);
  if (slug) return uniqueKey(slug, taken);
  let n = taken.length + 1;
  while (taken.includes(`layer-${n}`)) n += 1;
  return `layer-${n}`;
}
