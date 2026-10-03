import type { ActionsLayout, ZoneDisplay, ZoneInfo } from "../types";

// Where a button can live: the header row, the footer row, or a zone.
export type ZoneGroup = `zone:${string}`;
export type ActionGroup = "header" | "footer" | ZoneGroup;

const ZONE_GROUP_PREFIX = "zone:";

export function zoneGroup(name: string): ZoneGroup {
  return `${ZONE_GROUP_PREFIX}${name}`;
}

export function isZoneGroup(group: ActionGroup): group is ZoneGroup {
  return group.startsWith(ZONE_GROUP_PREFIX);
}

export function zoneNameOfGroup(group: ZoneGroup): string {
  return group.slice(ZONE_GROUP_PREFIX.length);
}

// A zone sits in the header or footer list beside buttons. Its id can't be an
// action key, and it has no ":" — any id with one is read as a menu path.
export const ZONE_ITEM_PREFIX = "@zone/";

export function zoneItemId(name: string): string {
  return `${ZONE_ITEM_PREFIX}${name}`;
}

export function isZoneItemId(id: string): boolean {
  return id.startsWith(ZONE_ITEM_PREFIX);
}

export function zoneNameOfItem(id: string): string {
  return id.slice(ZONE_ITEM_PREFIX.length);
}

// Where a menu item being dragged out would land if dropped: the row and
// the gap index between top-level buttons. Drives the insertion placeholder.
export interface ExtractIndicator {
  group: ActionGroup;
  index: number;
}

// While dragging a row inside an open drill menu, the pointer's third within
// the hovered sibling decides the action: reorder before/after it, or nest
// into it. Computed by collision detection, read by the drop handler, and
// surfaced to rows so they can draw the insertion line / nest highlight.
export type MenuDropMode = "before" | "after" | "nest";

export interface MenuDrop {
  target: string;
  mode: MenuDropMode;
}

// Prefixed so it can't collide with action names (slugify excludes colons).
export const GROUP_DROP_PREFIX = "actions-group:";

// Drops onto a group's empty area need a target; without these synthetic
// ids the drop would resolve to no target and the move would no-op.
export function groupDropId(group: ActionGroup): string {
  return `${GROUP_DROP_PREFIX}${group}`;
}

export function isGroupDropId(id: string): boolean {
  return id.startsWith(GROUP_DROP_PREFIX);
}

export function groupOfDropId(id: string): ActionGroup {
  return id.slice(GROUP_DROP_PREFIX.length) as ActionGroup;
}

// Any group takes a dragged button; a dragged zone goes only to the header or
// the footer, never into a zone.
export function groupAcceptsDrag(group: ActionGroup, activeId: string | null): boolean {
  return activeId === null || !isZoneItemId(activeId) || !isZoneGroup(group);
}

export const NEST_ID_PREFIX = "nest:";
export function nestId(name: string): string {
  return `${NEST_ID_PREFIX}${name}`;
}
export function isNestId(id: string): boolean {
  return id.startsWith(NEST_ID_PREFIX);
}
export function nestTargetOf(id: string): string {
  return id.slice(NEST_ID_PREFIX.length);
}

// Breadcrumb droppables of an open drill menu. The path after the prefix is
// the ancestor action a dragged child extracts out onto ("" = the toolbar).
export const CRUMB_ID_PREFIX = "crumb:";
export function crumbId(path: string): string {
  return `${CRUMB_ID_PREFIX}${path}`;
}
export function isCrumbId(id: string): boolean {
  return id.startsWith(CRUMB_ID_PREFIX);
}
export function crumbTargetOf(id: string): string {
  return id.slice(CRUMB_ID_PREFIX.length);
}

export function listOf(layout: ActionsLayout, group: ActionGroup): string[] {
  if (group === "header") return layout.header;
  if (group === "footer") return layout.footer;
  return layout.zones[zoneNameOfGroup(group)] ?? [];
}

function groupsOf(layout: ActionsLayout): ActionGroup[] {
  return ["header", "footer", ...Object.keys(layout.zones).map(zoneGroup)];
}

export function groupOf(layout: ActionsLayout, id: string): ActionGroup | null {
  return groupsOf(layout).find((group) => listOf(layout, group).includes(id)) ?? null;
}

export function zoneOfButton(layout: ActionsLayout, zones: ZoneInfo[], id: string): ZoneInfo | undefined {
  const group = groupOf(layout, id);
  if (group === null || !isZoneGroup(group)) return undefined;
  const name = zoneNameOfGroup(group);
  return zones.find((zone) => zone.name === name);
}

// The zone whose frame is under the pointer; null outside every zone. Never
// read from a zone's drop area: after a preview, dnd-kit re-measures only the
// items of the sortable lists that changed (plus droppables that resized), so
// a drop area that merely shifted keeps its old rect and would claim the
// neighbouring button. The frame is an item of its row, re-measured whenever
// that row's list changes, as it does when a button moves between the row and
// a zone.
export function zoneUnderPointer(ids: string[]): string | null {
  const frame = ids.find(isZoneItemId);
  return frame === undefined ? null : zoneNameOfItem(frame);
}

// The row a zone sits in according to `layout`; null when it isn't there.
export function rowOfZone(layout: ActionsLayout, name: string): ZoneDisplay | null {
  const id = zoneItemId(name);
  if (layout.header.includes(id)) return "header";
  if (layout.footer.includes(id)) return "footer";
  return null;
}

// What a zone growing or shrinking can move: in a right-anchored row, the
// items before it and the drop areas and buttons of the zones among them;
// once the row wraps, any of them.
export function movedByZoneResize(layout: ActionsLayout, row: ZoneDisplay): string[] {
  const items = row === "header" ? layout.header : layout.footer;
  return [
    ...items,
    ...items.filter(isZoneItemId).flatMap((id) => {
      const name = zoneNameOfItem(id);
      return [groupDropId(zoneGroup(name)), ...(layout.zones[name] ?? [])];
    }),
  ];
}

export interface DropTarget {
  group: ActionGroup;
  index: number;
}

export function resolveTarget(overId: string, layout: ActionsLayout): DropTarget | null {
  if (isGroupDropId(overId)) {
    const group = groupOfDropId(overId);
    if (!groupsOf(layout).includes(group)) return null;
    return { group, index: listOf(layout, group).length };
  }
  const group = groupOf(layout, overId);
  return group ? { group, index: listOf(layout, group).indexOf(overId) } : null;
}

export function applyMove(
  layout: ActionsLayout,
  draggedId: string,
  target: DropTarget,
): ActionsLayout {
  if (!groupsOf(layout).includes(target.group)) return layout;
  // A zone never goes inside a zone.
  if (isZoneItemId(draggedId) && isZoneGroup(target.group)) return layout;
  const without = (ids: string[]) => ids.filter((id) => id !== draggedId);
  const next: ActionsLayout = {
    header: without(layout.header),
    footer: without(layout.footer),
    zones: Object.fromEntries(
      Object.entries(layout.zones).map(([name, ids]) => [name, without(ids)]),
    ),
  };
  const list = isZoneGroup(target.group)
    ? next.zones[zoneNameOfGroup(target.group)]
    : next[target.group];
  list.splice(Math.max(0, Math.min(target.index, list.length)), 0, draggedId);
  return next;
}

// A zone's buttons take its spot in its row when the zone goes away.
export function layoutWithoutZone(layout: ActionsLayout, name: string): ActionsLayout {
  const inside = Object.hasOwn(layout.zones, name) ? layout.zones[name] : [];
  const zones = { ...layout.zones };
  delete zones[name];
  const unwrap = (ids: string[]) => ids.flatMap((id) => (id === zoneItemId(name) ? inside : [id]));
  return { header: unwrap(layout.header), footer: unwrap(layout.footer), zones };
}

export function sameLayout(a: ActionsLayout, b: ActionsLayout): boolean {
  if (!arrayEq(a.header, b.header) || !arrayEq(a.footer, b.footer)) return false;
  const names = Object.keys(a.zones);
  if (names.length !== Object.keys(b.zones).length) return false;
  return names.every(
    (name) => Object.hasOwn(b.zones, name) && arrayEq(a.zones[name], b.zones[name]),
  );
}

export function arrayEq(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
