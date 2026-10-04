import YAML from "yaml";
import { buildLayoutUpdates, patchLayoutDoc } from "./actionsLayoutUpdates";
import { groupOf, isZoneGroup, rowOfZone, zoneItemId, zoneNameOfGroup } from "./components/actionsDndLayout";
import { zoneOfListKey } from "./zoneLayers";
import type { ActionInfo, ActionsLayout, ZoneDisplay, ZoneInfo, ZoneRows } from "./types";
import { slugify } from "./slugify";
import { uniqueKey } from "./uniqueKey";

type Doc = ReturnType<typeof YAML.parseDocument>;

export interface NewZone {
  label: string;
  rows: ZoneRows;
  display: ZoneDisplay;
}

// What the app shows now: a new zone is placed and numbered among it.
export interface ActionsSnapshot {
  actions: ActionInfo[];
  zones: ZoneInfo[];
  layout: ActionsLayout;
}

export interface ZoneDetails {
  label: string;
  rows: ZoneRows;
}

// A zone without a name of its own shows its key; the dialog leaves Name empty for it.
export function zoneDetailsOf(zone: Pick<ZoneInfo, "name" | "label" | "rows">): ZoneDetails {
  return { label: zone.label === zone.name ? "" : zone.label, rows: zone.rows };
}

const RESERVED_ZONE_NAMES = ["header", "footer", "menu", "button"];

// From the name, or "zone" when the name gives nothing usable; never a
// reserved name, and unique among the project's zones.
export function zoneKeyFor(label: string, taken: string[]): string {
  const slug = slugify(label);
  return uniqueKey(slug && !RESERVED_ZONE_NAMES.includes(slug) ? slug : "zone", taken);
}

function zonesOf(doc: Doc, create: boolean): YAML.YAMLMap | null {
  const node = doc.get("zones", true);
  if (YAML.isMap(node)) return node;
  if (!create) return null;
  doc.set("zones", doc.createNode({}));
  const created = doc.get("zones", true);
  return YAML.isMap(created) ? created : null;
}

function zoneKeysIn(doc: Doc): string[] {
  const items = zonesOf(doc, false)?.items ?? [];
  return items.flatMap((item) => (YAML.isScalar(item.key) ? [String(item.key.value)] : []));
}

// The header is the default, so only a footer zone says where it sits.
// The key is picked against this file as well as the zones shown: two
// creations can start from the same render, and `set` on a taken key would
// replace that zone.
// The zone goes last in its row and the row is numbered the way a drag
// numbers it: the backend sorts a button without a position after every
// numbered one, so a lone position on the zone could put it first or mid-row.
// The other row and the zones' buttons keep their order, so they are left out.
export function addZoneToDoc(doc: Doc, { label, rows, display }: NewZone, snapshot: ActionsSnapshot): void {
  const name = zoneKeyFor(label, [...snapshot.zones.map((zone) => zone.name), ...zoneKeysIn(doc)]);
  const entry: Record<string, unknown> = { rows };
  if (display === "footer") entry.display = display;
  const trimmed = label.trim();
  if (trimmed) entry.label = trimmed;
  zonesOf(doc, true)?.set(name, doc.createNode(entry));
  const items = [...snapshot.layout[display], zoneItemId(name)];
  const row: ActionsLayout = {
    header: display === "header" ? items : [],
    footer: display === "footer" ? items : [],
    zones: {},
  };
  patchLayoutDoc(doc, buildLayoutUpdates(snapshot.actions, row));
}

// A new zone holding one button, written with the move in one edit so it never
// shows empty: it takes the button's spot in its row, or comes right after the
// zone the button was in. Returns the zone's key, or null when the button sits
// in no row or zone.
export function addZoneAroundActionToDoc(doc: Doc, action: string, rows: ZoneRows, snapshot: ActionsSnapshot): string | null {
  const { layout } = snapshot;
  const group = groupOf(layout, action);
  if (group === null) return null;
  let from: string | null = null;
  let display: ZoneDisplay | null = null;
  if (isZoneGroup(group)) {
    from = zoneOfListKey(zoneNameOfGroup(group));
    display = rowOfZone(layout, from);
  } else {
    display = group;
  }
  if (display === null) return null;
  const name = zoneKeyFor("", [...snapshot.zones.map((zone) => zone.name), ...zoneKeysIn(doc)]);
  zonesOf(doc, true)?.set(name, doc.createNode(display === "footer" ? { rows, display } : { rows }));
  const items = layout[display].filter((key) => key !== action);
  const at = from === null ? layout[display].indexOf(action) : items.indexOf(zoneItemId(from)) + 1;
  items.splice(at, 0, zoneItemId(name));
  const next: ActionsLayout = {
    header: display === "header" ? items : [],
    footer: display === "footer" ? items : [],
    zones: { [name]: [action] },
  };
  patchLayoutDoc(doc, buildLayoutUpdates(snapshot.actions, next, layout, snapshot.zones));
  return name;
}

// An empty name drops `label`, so the zone shows its key or a lower file's label.
export function setZoneDetailsInDoc(doc: Doc, name: string, { label, rows }: ZoneDetails): void {
  const zones = zonesOf(doc, true);
  if (!zones) return;
  const trimmed = label.trim();
  const entry = zones.get(name, true);
  if (!YAML.isMap(entry)) {
    zones.set(name, doc.createNode(trimmed ? { rows, label: trimmed } : { rows }));
    return;
  }
  entry.set("rows", rows);
  if (trimmed) entry.set("label", trimmed);
  else entry.delete("label");
}

export function removeZoneFromDoc(doc: Doc, name: string): void {
  const zones = zonesOf(doc, false);
  if (!zones) return;
  zones.delete(name);
  if (zones.items.length === 0) doc.delete("zones");
}
