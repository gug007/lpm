import {
  type ActionInfo,
  type ActionsLayout,
  type ZoneDisplay,
  type ZoneInfo,
  isFooterDisplay,
  isHeaderDisplay,
  zoneDisplayOf,
} from "./types";
import { zoneItemId } from "./components/actionsDndLayout";

// One spot in the header or footer row: a button, or a zone with its buttons.
export type RowItem =
  | { kind: "action"; id: string; action: ActionInfo }
  | { kind: "zone"; id: string; zone: ZoneInfo; actions: ActionInfo[] };

export interface ActionsModel {
  headerItems: RowItem[];
  footerItems: RowItem[];
  headerActions: ActionInfo[];
  footerActions: ActionInfo[];
  menuActions: ActionInfo[];
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
        (zone): Entry => ({
          name: zone.name,
          position: zone.position,
          item: { kind: "zone", id: zoneItemId(zone.name), zone, actions: inZone.get(zone.name) ?? [] },
        }),
      ),
  ];
  return entries.sort(comparePosition).map((entry) => entry.item);
}

function actionsOf(items: RowItem[]): ActionInfo[] {
  return items.flatMap((item) => (item.kind === "action" ? [item.action] : []));
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
// than disappearing. Zones join the header or the footer by their display.
export function buildActionsModel(actions: ActionInfo[], zones: ZoneInfo[]): ActionsModel {
  const inZone = new Map<string, ActionInfo[]>(zones.map((zone) => [zone.name, []]));
  const header: ActionInfo[] = [];
  const footer: ActionInfo[] = [];
  const menuActions: ActionInfo[] = [];
  for (const action of actions) {
    const zoneActions = isHeaderDisplay(action.display) ? undefined : inZone.get(action.display);
    if (isFooterDisplay(action.display)) footer.push(action);
    else if (action.display === "menu") menuActions.push(action);
    else if (zoneActions) zoneActions.push(action);
    else header.push(action);
  }
  const headerItems = rowItems("header", header, zones, inZone);
  const footerItems = rowItems("footer", footer, zones, inZone);
  const layout: ActionsLayout = {
    header: headerItems.map((item) => item.id),
    footer: footerItems.map((item) => item.id),
    zones: Object.fromEntries(
      zones.map((zone) => [zone.name, (inZone.get(zone.name) ?? []).map((action) => action.name)]),
    ),
  };
  return {
    headerItems,
    footerItems,
    headerActions: actionsOf(headerItems),
    footerActions: actionsOf(footerItems),
    menuActions,
    layout,
    nextHeaderPosition: nextPosition(headerItems),
    nextFooterPosition: nextPosition(footerItems),
  };
}
