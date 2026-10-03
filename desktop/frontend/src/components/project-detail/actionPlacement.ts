import YAML from "yaml";
import type { ActionPatch } from "../../actionConfig";
import { isFooterDisplay, type ZoneInfo } from "../../types";
import { layerOfListKey, listKeyForAction, zoneOfListKey } from "../../zoneLayers";

const PLACEMENT_KEYS = ["display", "layer"] as const;

// What the placement picker shows: header, footer, or one of the project's
// zones, as zone/layer for a zone with layers. Legacy values and missing zones
// read as header.
export function placementOf(display: string, layer: string | undefined, zones: readonly ZoneInfo[]): string {
  if (isFooterDisplay(display)) return "footer";
  const zone = zones.find((entry) => entry.name === display);
  return zone ? listKeyForAction(zone, layer) : "header";
}

export function placementParts(value: string): { display: string; layer: string | null } {
  return { display: zoneOfListKey(value), layer: layerOfListKey(value) };
}

// The display change a save writes. An untouched placement writes nothing, so
// editing a command never moves the button or copies its spot into the file
// that declares it. A touched one is always written out, the header too, as
// dragging does: a `display` in a lower file can't show through. A null layer
// means the key goes, so a stale one can't pull the button into a layer.
export function placementPatch(value: string, touched: boolean): { set?: string; layer?: string | null } {
  if (!touched) return {};
  const { display, layer } = placementParts(value);
  return { set: display, layer };
}

// The form's patch without placement, for when placement went into a note.
export function withoutPlacement(patch: ActionPatch): ActionPatch {
  const set = { ...patch.set };
  for (const key of PLACEMENT_KEYS) delete set[key];
  return { set, remove: patch.remove.filter((key) => !(PLACEMENT_KEYS as readonly string[]).includes(key)) };
}

export interface YamlPlacement {
  display: unknown;
  layer: unknown;
}

export function placementFields(payload: Record<string, unknown>): YamlPlacement {
  return { display: payload.display, layer: payload.layer };
}

// The YAML editor and the AI helper see only the declaring file, never a
// placement note in the project file, so placement counts as edited only when
// the returned YAML changed the display or layer it was shown.
export function placementFromYaml(
  prev: { display: string; displayTouched: boolean },
  shown: YamlPlacement,
  next: YamlPlacement,
  zones: readonly ZoneInfo[],
): { display: string; displayTouched: boolean } {
  if (next.display === shown.display && next.layer === shown.layer) {
    return { display: prev.display, displayTouched: prev.displayTouched };
  }
  const display = typeof next.display === "string" ? next.display : "";
  const layer = typeof next.layer === "string" ? next.layer : undefined;
  return { display: placementOf(display, layer, zones), displayTouched: true };
}

// When a note took the placement, the declaring file keeps its own display and layer.
export function withDeclaredDisplay(
  payload: Record<string, unknown>,
  declared: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...payload };
  for (const key of PLACEMENT_KEYS) {
    if (key in declared) next[key] = declared[key];
    else delete next[key];
  }
  return next;
}

export function yamlPlacement(yaml: string): YamlPlacement {
  const parsed: unknown = yaml.trim() ? YAML.parse(yaml) : null;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? placementFields(parsed as Record<string, unknown>)
    : { display: undefined, layer: undefined };
}
