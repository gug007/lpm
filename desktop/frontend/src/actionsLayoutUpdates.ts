import YAML from "yaml";
import { ACTION_SECTIONS, type ActionSection } from "./actionConfig";
import {
  type ActionInfo,
  type ActionsLayout,
  type ZoneDisplay,
  type ZoneInfo,
  isFooterDisplay,
  isHeaderDisplay,
  zoneDisplayOf,
} from "./types";
import {
  type ActionGroup,
  arrayEq,
  groupOf,
  isZoneGroup,
  isZoneItemId,
  rowOfZone,
  zoneGroup,
  listKeyOfGroup,
  zoneNameOfItem,
} from "./components/actionsDndLayout";
import { layerOfListKey, listKeyForAction, listKeysInLayout, zoneOfListKey } from "./zoneLayers";
import { zonesOf } from "./zoneDoc";

type Doc = ReturnType<typeof YAML.parseDocument>;

export interface ActionUpdate {
  position: number;
  // undefined → leave display untouched (same-group reorder keeps legacy
  // values like "button"). string → set display ("header", "footer" or a
  // zone name). The header is written out rather than deleting the key so it
  // also overrides a display inherited from another config file.
  display?: string;
  // Written beside display when the button changed lists. string → set the
  // layer; null → drop it from the project file's entry; undefined → leave it.
  layer?: string | null;
  // Where to write a sparse override when the key isn't already in the
  // project YAML — derived from the resolved action's type so a global
  // terminal override lands in `terminals:`, not `actions:`.
  section: ActionSection;
}

export interface ZoneUpdate {
  position: number;
  // Set when the zone changed rows. The header is written out too, so it
  // overrides a footer inherited from another config file.
  display?: ZoneDisplay;
}

export interface LayoutUpdates {
  actions: Map<string, ActionUpdate>;
  // Zone name → its spot among its row's items, and its row when that changed.
  zones: Map<string, ZoneUpdate>;
}

// A display that names no zone of the layout shows in the header, as in
// buildActionsModel, so it counts as the header here too. A layer that's
// missing counts as the zone's first. Without zone infos (callers that only
// renumber a row) the layout's own keys, which come in layer order, stand in.
function groupOfAction(action: ActionInfo, zones: ZoneInfo[], layout: ActionsLayout): ActionGroup | null {
  const { display } = action;
  if (isHeaderDisplay(display)) return "header";
  if (isFooterDisplay(display)) return "footer";
  if (display === "menu") return null;
  const zone = zones.find((candidate) => candidate.name === display);
  if (zone) return zoneGroup(listKeyForAction(zone, action.layer));
  const keys = listKeysInLayout(layout, display);
  if (keys.length === 0) return "header";
  return zoneGroup(keys.find((key) => layerOfListKey(key) === action.layer) ?? keys[0]);
}

function isLayerGroup(group: ActionGroup | null): boolean {
  return group !== null && isZoneGroup(group) && layerOfListKey(listKeyOfGroup(group)) !== null;
}

// `before` is the layout a drag started from. A drag previews its moves into
// the store, so by the drop a dragged item's display already names its target
// and only that layout still knows where it came from. `zones` gives a zone's
// row when `before` doesn't list it.
export function buildLayoutUpdates(
  current: ActionInfo[],
  layout: ActionsLayout,
  before?: ActionsLayout,
  zones: ZoneInfo[] = [],
): LayoutUpdates {
  const actions = new Map<string, ActionUpdate>();
  const zoneUpdates = new Map<string, ZoneUpdate>();
  const previous = new Map<string, ActionGroup | null>();
  const sectionByKey = new Map<string, ActionSection>();
  const hadLayer = new Set<string>();
  const zoneRow = new Map<string, ZoneDisplay>(zones.map((zone) => [zone.name, zoneDisplayOf(zone)]));
  for (const action of current) {
    const startGroup = before ? groupOf(before, action.name) : null;
    const start = startGroup ?? groupOfAction(action, zones, layout);
    previous.set(action.name, start);
    // A previewed move out of a layer has already dropped the layer from the
    // store, so the drag-start list says it had one.
    if (action.layer !== undefined || isLayerGroup(start)) hadLayer.add(action.name);
    sectionByKey.set(action.name, action.type === "terminal" ? "terminals" : "actions");
  }
  // A row or zone list the move left as it was keeps what it has: rewriting
  // its positions would pin buttons declared in other files into this
  // project's file for nothing.
  const untouched = (keys: string[], start: string[] | undefined) => !!start && arrayEq(keys, start);
  for (const row of ["header", "footer"] as const) {
    if (before && untouched(layout[row], before[row])) continue;
    layout[row].forEach((key, index) => {
      if (!isZoneItemId(key)) return;
      const name = zoneNameOfItem(key);
      const start = (before && rowOfZone(before, name)) ?? zoneRow.get(name);
      zoneUpdates.set(name, start === undefined || start === row ? { position: index + 1 } : { position: index + 1, display: row });
    });
  }
  const visit = (keys: string[], placement: ActionGroup, display: string, layer: string | null) => {
    if (before && untouched(keys, isZoneGroup(placement) ? before.zones[listKeyOfGroup(placement)] : before[placement as ZoneDisplay])) return;
    keys.forEach((key, index) => {
      // Not a top-level action (any more): a layout from before a nest or an
      // outside edit still lists it, and a note for it would show as an empty
      // button.
      if (isZoneItemId(key) || !sectionByKey.has(key)) return;
      const update: ActionUpdate = { position: index + 1, section: sectionByKey.get(key) ?? "actions" };
      if (previous.get(key) !== placement) {
        update.display = display;
        if (layer !== null) update.layer = layer;
        else if (hadLayer.has(key)) update.layer = null;
      }
      actions.set(key, update);
    });
  };
  visit(layout.header, "header", "header", null);
  visit(layout.footer, "footer", "footer", null);
  for (const [listKey, keys] of Object.entries(layout.zones)) {
    visit(keys, zoneGroup(listKey), zoneOfListKey(listKey), layerOfListKey(listKey));
  }
  return { actions, zones: zoneUpdates };
}

export function applyActionUpdates(
  actions: ActionInfo[],
  updates: Map<string, ActionUpdate>,
): ActionInfo[] {
  return actions.map((action) => {
    const update = updates.get(action.name);
    if (!update) return action;
    const next: ActionInfo = { ...action, position: update.position };
    if (update.display !== undefined) next.display = update.display;
    if (update.layer === null) delete next.layer;
    else if (update.layer !== undefined) next.layer = update.layer;
    return next;
  });
}

export function applyZoneUpdates(zones: ZoneInfo[], updates: Map<string, ZoneUpdate>): ZoneInfo[] {
  return zones.map((zone) => {
    const update = updates.get(zone.name);
    if (!update) return zone;
    return update.display === undefined
      ? { ...zone, position: update.position }
      : { ...zone, position: update.position, display: update.display };
  });
}

function buildSeed(update: ActionUpdate, cmd?: string): Record<string, unknown> {
  const seed: Record<string, unknown> = { position: update.position };
  if (cmd !== undefined) seed.cmd = cmd;
  if (update.display !== undefined) seed.display = update.display;
  if (typeof update.layer === "string") seed.layer = update.layer;
  return seed;
}

// Shorthand string entries are widened to map form so the position/display
// fields have somewhere to attach. Keys present in the project YAML get an
// in-place patch; keys that only exist in another file get a sparse override
// (just position + display, and a layer when it names one) so other fields
// keep inheriting. Zones get a position the same way, plus display when they
// changed rows; an entry without rows stays a note on a zone declared
// elsewhere.
export function patchLayoutDoc(doc: Doc, updates: LayoutUpdates): void {
  const remaining = new Map(updates.actions);
  for (const section of ACTION_SECTIONS) {
    const node = doc.get(section, true);
    if (!YAML.isMap(node)) continue;
    for (const item of node.items) {
      if (!YAML.isScalar(item.key)) continue;
      const key = String(item.key.value);
      const update = remaining.get(key);
      if (!update) continue;
      if (YAML.isScalar(item.value) && typeof item.value.value === "string") {
        item.value = doc.createNode(buildSeed(update, item.value.value));
      } else if (YAML.isMap(item.value)) {
        item.value.set("position", update.position);
        if (update.display !== undefined) item.value.set("display", update.display);
        if (update.layer === null) item.value.delete("layer");
        else if (update.layer !== undefined) item.value.set("layer", update.layer);
      }
      remaining.delete(key);
    }
  }
  for (const [key, update] of remaining) {
    let section = doc.get(update.section, true);
    if (!YAML.isMap(section)) {
      doc.set(update.section, doc.createNode({}));
      section = doc.get(update.section, true);
    }
    if (!YAML.isMap(section)) continue;
    section.set(key, buildSeed(update));
  }
  if (updates.zones.size === 0) return;
  const zones = zonesOf(doc, true);
  if (!zones) return;
  for (const [name, update] of updates.zones) {
    const entry = zones.get(name, true);
    if (YAML.isMap(entry)) {
      entry.set("position", update.position);
      if (update.display !== undefined) entry.set("display", update.display);
    } else {
      const note = update.display === undefined ? { position: update.position } : { position: update.position, display: update.display };
      zones.set(name, doc.createNode(note));
    }
  }
}
