import YAML from "yaml";
import { buildLayoutUpdates, patchLayoutDoc } from "./actionsLayoutUpdates";
import { zoneItemId } from "./components/actionsDndLayout";
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
