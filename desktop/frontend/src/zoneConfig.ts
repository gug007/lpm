import YAML from "yaml";
import { buildLayoutUpdates, patchLayoutDoc } from "./actionsLayoutUpdates";
import { groupOf, isZoneGroup, rowOfZone, zoneItemId, zoneOfGroup } from "./components/actionsDndLayout";
import { keysOf, zonesOf } from "./zoneDoc";
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

// The header is the default, so only a footer zone says where it sits.
// The key is picked against this file as well as the zones shown: two
// creations can start from the same render, and `set` on a taken key would
// replace that zone.
function declareZone(doc: Doc, { label, rows, display }: NewZone, snapshot: ActionsSnapshot): string {
  const name = zoneKeyFor(label, [...snapshot.zones.map((zone) => zone.name), ...keysOf(zonesOf(doc, false))]);
  const entry: Record<string, unknown> = { rows };
  if (display === "footer") entry.display = display;
  const trimmed = label.trim();
  if (trimmed) entry.label = trimmed;
  zonesOf(doc, true)?.set(name, doc.createNode(entry));
  return name;
}

function rowLayout(display: ZoneDisplay, items: string[], zones: ActionsLayout["zones"] = {}): ActionsLayout {
  return { header: display === "header" ? items : [], footer: display === "footer" ? items : [], zones };
}

// The zone goes last in its row and the row is numbered the way a drag
// numbers it: the backend sorts a button without a position after every
// numbered one, so a lone position on the zone could put it first or mid-row.
// The other row and the zones' buttons keep their order, so they are left out.
export function addZoneToDoc(doc: Doc, zone: NewZone, snapshot: ActionsSnapshot): void {
  const name = declareZone(doc, zone, snapshot);
  const items = [...snapshot.layout[zone.display], zoneItemId(name)];
  patchLayoutDoc(doc, buildLayoutUpdates(snapshot.actions, rowLayout(zone.display, items)));
}

// A new zone holding one button, written with the move in one edit so it never
// shows empty: it takes the button's spot in its row, or comes right after the
// zone the button was in. Returns the zone's key, or null when the button sits
// in no row or zone.
export function addZoneAroundActionToDoc(doc: Doc, action: string, snapshot: ActionsSnapshot): string | null {
  const { layout } = snapshot;
  const group = groupOf(layout, action);
  if (group === null) return null;
  let from: string | null = null;
  let display: ZoneDisplay | null = null;
  if (isZoneGroup(group)) {
    from = zoneOfGroup(group);
    display = rowOfZone(layout, from);
  } else {
    display = group;
  }
  if (display === null) return null;
  const name = declareZone(doc, { label: "", rows: 1, display }, snapshot);
  const items = layout[display].filter((key) => key !== action);
  const at = from === null ? layout[display].indexOf(action) : items.indexOf(zoneItemId(from)) + 1;
  items.splice(at, 0, zoneItemId(name));
  patchLayoutDoc(
    doc,
    buildLayoutUpdates(snapshot.actions, rowLayout(display, items, { [name]: [action] }), layout, snapshot.zones),
  );
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
