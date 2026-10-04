import {
  type ActionInfo,
  type ActionsLayout,
  type LayerInfo,
  type ZoneDisplay,
  type ZoneInfo,
  isFooterDisplay,
  isHeaderDisplay,
  zoneDisplayOf,
} from "./types";
import { zoneItemId } from "./components/actionsDndLayout";
import { layersOf, listKeyForAction, listKeysOfZone } from "./zoneLayers";

// One of a zone's button lists: a layer, or the whole zone (layer null) when
// it has no layers.
export interface ZoneLayerView {
  key: string;
  layer: LayerInfo | null;
  ids: string[];
  actions: ActionInfo[];
}

// One spot in the header or footer row: a button, or a zone with its buttons
// (`actions` holds every layer's, in layer order).
export type RowItem =
  | { kind: "action"; id: string; action: ActionInfo }
  | { kind: "zone"; id: string; zone: ZoneInfo; actions: ActionInfo[]; layers: ZoneLayerView[] };

export interface ActionsModel {
  headerItems: RowItem[];
  footerItems: RowItem[];
  layout: ActionsLayout;
  nextHeaderPosition: number;
  nextFooterPosition: number;
}

interface Positioned {
  name: string;
  position?: number;
}

function compareNames(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Mirrors the backend's sort_action_names so optimistic updates match what
// the next ListProjects returns: positioned entries first; ties and
// unpositioned entries by name, bytewise like Rust's String::cmp (not
// localeCompare, which orders case and "-" vs "_" differently).
export function comparePosition(a: Positioned, b: Positioned): number {
  const ap = a.position;
  const bp = b.position;
  if (ap !== undefined && bp !== undefined) return ap - bp || compareNames(a.name, b.name);
  if (ap !== undefined) return -1;
  if (bp !== undefined) return 1;
  return compareNames(a.name, b.name);
}

export function sortByPosition<T extends Positioned>(items: T[]): T[] {
  return [...items].sort(comparePosition);
}

function zoneLayerViews(zone: ZoneInfo, inZone: Map<string, ActionInfo[]>): ZoneLayerView[] {
  const layers = layersOf(zone);
  return listKeysOfZone(zone).map((key, index) => {
    const actions = inZone.get(key) ?? [];
    return { key, layer: layers[index] ?? null, ids: actions.map((action) => action.name), actions };
  });
}

function rowItems(
  row: ZoneDisplay,
  actions: ActionInfo[],
  zones: ZoneInfo[],
  inZone: Map<string, ActionInfo[]>,
): RowItem[] {
  type Entry = Positioned & { item: RowItem };
  const entries: Entry[] = [
    ...actions.map(
      (action): Entry => ({
        name: action.name,
        position: action.position,
        item: { kind: "action", id: action.name, action },
      }),
    ),
    ...zones
      .filter((zone) => zoneDisplayOf(zone) === row)
      .map(
        (zone): Entry => {
          const layers = zoneLayerViews(zone, inZone);
          const actions = layers.flatMap((layer) => layer.actions);
          return {
            name: zone.name,
            position: zone.position,
            item: { kind: "zone", id: zoneItemId(zone.name), zone, actions, layers },
          };
        },
      ),
  ];
  return entries.sort(comparePosition).map((entry) => entry.item);
}

// Past the highest position in the row; an item without one counts as its index + 1.
function nextPosition(items: RowItem[]): number {
  return (
    items.reduce((max, item, index) => {
      const position = item.kind === "zone" ? item.zone.position : item.action.position;
      return Math.max(max, position ?? index + 1);
    }, 0) + 1
  );
}

// One past the highest position of any action, in a row, a zone or the menu.
// Not a count: positions can be sparse (10, 20), and a zone numbers its own
// buttons, so one can outgrow the rows around it.
export function nextActionPosition(actions: ActionInfo[]): number {
  return actions.reduce((max, action) => Math.max(max, action.position ?? 0), 0) + 1;
}

// A button whose display names no known zone shows in the header rather
// than disappearing, and one naming no layer of its zone in the first layer.
// Zones join the header or the footer by their display.
export function buildActionsModel(actions: ActionInfo[], zones: ZoneInfo[]): ActionsModel {
  const zoneByName = new Map(zones.map((zone) => [zone.name, zone]));
  const listKeys = zones.flatMap(listKeysOfZone);
  const inZone = new Map<string, ActionInfo[]>(listKeys.map((key) => [key, []]));
  const header: ActionInfo[] = [];
  const footer: ActionInfo[] = [];
  for (const action of actions) {
    const zone = isHeaderDisplay(action.display) ? undefined : zoneByName.get(action.display);
    const zoneActions = zone && inZone.get(listKeyForAction(zone, action.layer));
    if (isFooterDisplay(action.display)) footer.push(action);
    else if (action.display === "menu") continue;
    else if (zoneActions) zoneActions.push(action);
    else header.push(action);
  }
  const headerItems = rowItems("header", header, zones, inZone);
  const footerItems = rowItems("footer", footer, zones, inZone);
  const layout: ActionsLayout = {
    header: headerItems.map((item) => item.id),
    footer: footerItems.map((item) => item.id),
    zones: Object.fromEntries(
      listKeys.map((key) => [key, (inZone.get(key) ?? []).map((action) => action.name)]),
    ),
  };
  return {
    headerItems,
    footerItems,
    layout,
    nextHeaderPosition: nextPosition(headerItems),
    nextFooterPosition: nextPosition(footerItems),
  };
}
