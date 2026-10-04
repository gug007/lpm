import { type ClientRect, type Collision, type CollisionDetection, closestCenter, pointerWithin } from "@dnd-kit/core";
import type { ActionsLayout } from "../types";
import { isChildId, splitChild } from "../actionIds";
import {
  type ExtractIndicator,
  type MenuDrop,
  groupDropId,
  groupOfDropId,
  isCrumbId,
  isGroupDropId,
  isNestId,
  isZoneDotsId,
  isZoneItemId,
  listOf,
  nestId,
  zoneGroup,
  zoneNameOfItem,
  zoneOfDotsId,
  zoneUnderPointer,
} from "./actionsDndLayout";
import { type HeldCollision, holdWhilePointerStill } from "./holdWhilePointerStill";

type CollisionArgs = Parameters<CollisionDetection>[0];
type Point = { x: number; y: number };

// Nest is the default while the pointer is in the leading part of a
// same-level button; the target only yields to a sortable reorder gap
// once the pointer crosses this fraction of it in the drag direction.
// Lower = easier to reorder, higher = easier to nest.
const NEST_THRESHOLD = 0.45;

// Rows only reorder sideways; a zone's grid also up and down, so there the
// axis the drag moved along most decides which part of a button leads.
function inNestRegion(rect: ClientRect, point: Point, moved: Point, grid: boolean): boolean {
  const vertical = grid && Math.abs(moved.y) > Math.abs(moved.x);
  const start = vertical ? rect.top : rect.left;
  const size = vertical ? rect.height : rect.width;
  const at = vertical ? point.y : point.x;
  const forward = (vertical ? moved.y : moved.x) >= 0;
  const line = start + size * (forward ? NEST_THRESHOLD : 1 - NEST_THRESHOLD);
  return forward ? at <= line : at >= line;
}

function distanceTo(point: Point, rect: ClientRect): number {
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
  const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
  return Math.hypot(dx, dy);
}

// A release this far from every row, zone and menu puts the button back.
const OUTSIDE_SLACK = 24;

// A menu item's row in an open dropdown: an action path, not one of the
// prefixed ids the rows, nests, crumbs and dots register.
function isMenuRow(id: string): boolean {
  return isChildId(id) && !isGroupDropId(id) && !isNestId(id) && !isCrumbId(id) && !isZoneDotsId(id);
}

interface Placed {
  id: string;
  rect: ClientRect;
}

// The row's measured items on the pointer's line, left to right: a wrapped row
// reads like text, so a gap is only ever between neighbours on one line.
function lineAt(args: CollisionArgs, list: string[], point: Point): Placed[] {
  const placed = list.flatMap((id) => {
    const rect = args.droppableRects.get(id);
    return rect && rect.width > 0 ? [{ id, rect }] : [];
  });
  if (placed.length === 0) return [];
  // The line the pointer's height falls on, even where it's empty beside the
  // buttons; between lines, the nearest one.
  const level = placed.filter(({ rect }) => point.y >= rect.top && point.y <= rect.bottom);
  const anchor = (level.length > 0 ? level : placed).reduce((best, item) =>
    distanceTo(point, item.rect) < distanceTo(point, best.rect) ? item : best,
  );
  return placed.filter(({ rect }) => rect.top < anchor.rect.bottom && rect.bottom > anchor.rect.top);
}

// The list index of the gap the pointer points at, from the buttons' measured
// midpoints so it matches what the user sees.
function gapIndex(args: CollisionArgs, list: string[], point: Point): number {
  const line = lineAt(args, list, point);
  if (line.length === 0) return list.length;
  const next = line.find(({ rect }) => point.x < rect.left + rect.width / 2);
  return next ? list.indexOf(next.id) : list.indexOf(line[line.length - 1].id) + 1;
}

// A release in a gap of a row stands for a slot of that row: the button before
// the gap when the dragged one sits at or before it, otherwise the one after
// it, as the row's sortable list reads an over target. A button from another
// row goes in front of the one after the gap. null: past the row's last
// button, where the row itself appends.
function gapSlot(args: CollisionArgs, list: string[], active: string, point: Point): string | null {
  const index = gapIndex(args, list, point);
  const from = list.indexOf(active);
  if (from !== -1 && index > 0 && index - 1 >= from) return list[index - 1];
  return list[index] ?? null;
}

// Where a dragged-out menu item would land. A zone under the pointer takes it
// at its end, the next free slot; a row takes it at the gap the pointer is at.
function computeInsertion(
  args: CollisionArgs,
  ids: string[],
  layout: ActionsLayout,
  point: Point,
  openListOf: (zone: string) => string,
): ExtractIndicator | null {
  const zone = zoneUnderPointer(ids);
  if (zone !== null) {
    const group = zoneGroup(openListOf(zone));
    return { group, index: listOf(layout, group).length };
  }
  const group = (["header", "footer"] as const).find((row) => ids.includes(groupDropId(row)));
  if (!group) return null;
  return { group, index: gapIndex(args, listOf(layout, group), point) };
}

export interface ActionsCollisionOptions {
  layout: ActionsLayout;
  // True when both actions live in the same config layer.
  canNest: (activeId: string, targetId: string) => boolean;
  updateIndicator: (next: ExtractIndicator | null) => void;
  updateMenuDrop: (next: MenuDrop | null) => void;
  // The answer a still pointer keeps; cleared when the drag ends.
  held: { current: HeldCollision | null };
  // The list a zone takes drops into: its open layer's.
  openListOf?: (zone: string) => string;
  // The button a nest is offered on while the pointer rests in its leading
  // part, or null. The caller arms it after a pause.
  offerNest?: (target: string | null) => void;
  // The offered button once armed: only then does a drop nest into it.
  nestArmed?: { current: string | null };
  // True over an open menu panel, which covers whatever lies beneath it.
  overMenu?: (point: Point) => boolean;
  // Where the pointer picked the item up: the drag's direction is read from
  // it, not from the overlay, which a modifier can shift.
  dragStart?: { current: Point | null };
}

// A point just inside the rect, as near to `point` as it gets.
function clampInto(point: Point, rect: ClientRect): Point {
  const inset = (size: number) => Math.min(1, size / 2);
  return {
    x: Math.min(Math.max(point.x, rect.left + inset(rect.width)), rect.right - inset(rect.width)),
    y: Math.min(Math.max(point.y, rect.top + inset(rect.height)), rect.bottom - inset(rect.height)),
  };
}

// pointerWithin reports the item, its full-size nest zone, and the
// wrapping row. We pick exactly one: a top-level button nests once the
// pointer has rested in a button's leading part, and reorders past it; a
// menu item being dragged out nests the same way, otherwise opens an
// insertion gap and extracts to it. A dragged zone only moves among the
// header's and the footer's items, and a button over a zone lands inside it —
// never on the zone's frame.
export function createActionsCollision({
  layout,
  canNest,
  updateIndicator,
  updateMenuDrop,
  held,
  openListOf = (zone) => zone,
  offerNest = () => {},
  nestArmed = { current: null },
  overMenu = () => false,
  dragStart = { current: null },
}: ActionsCollisionOptions): CollisionDetection {
  const detect = (args: CollisionArgs, offer: (target: string) => void, clamped = false): Collision[] => {
    const active = String(args.active.id);
    const zoneDrag = isZoneItemId(active);
    const activeRef = splitChild(active);
    // A dragged zone moves among the rows' items and onto the rows themselves;
    // a zone's frame is such an item, its buttons and drop area are not.
    const rowLevel = (id: string) =>
      id === groupDropId("header") || id === groupDropId("footer") || layout.header.includes(id) || layout.footer.includes(id);
    const pointer = pointerWithin(args);
    const point = args.pointerCoordinates;
    if (pointer.length === 0) {
      updateMenuDrop(null);
      // Hidden rows (footer under the config/notes view) register 0x0
      // rects that closestCenter would pick, committing invisible drops.
      // Without frames, a button nearest a zone joins it rather than taking
      // the zone's place in the header. Without nest drops, a release just
      // outside a row reorders next to the nearest button instead of silently
      // nesting into it; a nest drop has its button's rect, so it wins ties.
      // A menu's rows and crumbs only count under the pointer.
      const measurable = args.droppableContainers.filter((c) => {
        const rect = c.rect.current;
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;
        const id = String(c.id);
        if (isNestId(id) || isZoneDotsId(id) || isMenuRow(id) || isCrumbId(id)) return false;
        return zoneDrag ? rowLevel(id) : !isZoneItemId(id);
      });
      // An open menu's own chrome takes no drop and hides what lies beneath.
      if (!point || clamped || (activeRef && overMenu(point))) {
        updateIndicator(null);
        return [];
      }
      let nearest: { rect: ClientRect; distance: number } | null = null;
      for (const c of measurable) {
        const rect = c.rect.current;
        const distance = rect ? distanceTo(point, rect) : Infinity;
        if (rect && (!nearest || distance < nearest.distance)) nearest = { rect, distance };
      }
      if (!nearest || nearest.distance > OUTSIDE_SLACK) {
        updateIndicator(null);
        return [];
      }
      // Just off a thin row or zone, the pointer reads as if on its nearest edge.
      return detect({ ...args, pointerCoordinates: clampInto(point, nearest.rect) }, offer, true);
    }
    // Between a row's items, the slot the gap stands for; the row itself
    // when the pointer is past its last one.
    const inRowGap = (rowDrop: Collision): Collision[] => {
      const row = groupOfDropId(String(rowDrop.id));
      if (!point || (row !== "header" && row !== "footer")) return [rowDrop];
      const slot = gapSlot(args, listOf(layout, row), active, point);
      return [slot === null ? rowDrop : { id: slot }];
    };
    if (zoneDrag) {
      updateIndicator(null);
      updateMenuDrop(null);
      // Includes its own slot, so a drop in place stays a no-op.
      const hit = pointer.find((c) => rowLevel(String(c.id)));
      if (!hit) return [];
      return isGroupDropId(String(hit.id)) ? inRowGap(hit) : [hit];
    }

    const ids = pointer.map((c) => String(c.id));
    const nonNest = pointer.filter((c) => !isNestId(String(c.id)));
    const items = pointer.filter((c) => {
      const id = String(c.id);
      return !isGroupDropId(id) && !isNestId(id) && id !== active;
    });
    const nestHit = (name: string) => [{ id: nestId(name) }];
    const extractTo = (ins: ExtractIndicator) => {
      updateIndicator(ins);
      updateMenuDrop(null);
      const list = listOf(layout, ins.group);
      const anchor = list[Math.min(ins.index, list.length - 1)];
      return anchor ? [{ id: anchor }] : [{ id: groupDropId(ins.group) }];
    };

    // Over a zone's dots — where a hover opens another layer — a button
    // targets the dots themselves, whatever lies under the pill's upper half,
    // and a release joins the open layer at its end.
    const dots = pointer.find((c) => isZoneDotsId(String(c.id)));
    if (dots) {
      const group = zoneGroup(openListOf(zoneOfDotsId(String(dots.id))));
      if (activeRef) return extractTo({ group, index: listOf(layout, group).length });
      updateIndicator(null);
      updateMenuDrop(null);
      return [dots];
    }
    const initial = args.active.rect.current.initial ?? args.collisionRect;
    const start = dragStart.current;
    const moved =
      start && point
        ? { x: point.x - start.x, y: point.y - start.y }
        : { x: args.collisionRect.left - initial.left, y: args.collisionRect.top - initial.top };
    // A zone's frame takes no nest drops: dropping there adds to the zone.
    const nests = (target: string, grid: boolean) => {
      if (target === active || isChildId(target) || isZoneItemId(target)) return false;
      if (!point || !canNest(active, target)) return false;
      const rect = args.droppableRects.get(target);
      return !!rect && inNestRegion(rect, point, moved, grid);
    };
    // A pass over a button never nests into it: until the pointer has rested
    // there, the drag keeps showing what it showed before.
    // Fresh from outside every row there is nothing to keep, and the drag
    // shows what a release there would do without the nest.
    const nestOrHold = (target: string, fresh: () => Collision[]): Collision[] => {
      offer(target);
      if (nestArmed.current === target) return nestHit(target);
      const shown = held.current?.result;
      return shown?.length && !shown.some((c) => isNestId(String(c.id))) ? shown : fresh();
    };
    const slotOf = (target: string) => () => [{ id: target }];

    if (activeRef) {
      // A breadcrumb under the pointer wins over the extract-to-toolbar
      // insertion: dropping there moves the child out one level.
      const crumbHit = pointer.find((c) => isCrumbId(String(c.id)));
      if (crumbHit) {
        updateIndicator(null);
        updateMenuDrop(null);
        return [{ id: crumbHit.id }];
      }
      // An open menu sits above the buttons it covers: its rows win, and its
      // padding takes no drop.
      const row = items.find((c) => isMenuRow(String(c.id)));
      if (!row && point && overMenu(point)) {
        updateIndicator(null);
        updateMenuDrop(null);
        return [];
      }
      const overItem = row ? String(row.id) : items[0] ? String(items[0].id) : null;
      // A child over a sibling row stays put (no shuffle). The pointer's
      // third within the row decides the action: top → reorder before,
      // bottom → reorder after, middle → nest into it. Recorded in menuDrop
      // for the drop handler and the row's insertion-line / nest highlight.
      // A row of a menu from another config file takes no drop: the edit is
      // made in the dragged item's file, which can't reach that menu.
      if (row && overItem && splitChild(overItem)?.parent !== activeRef.parent && !canNest(active, overItem)) {
        updateIndicator(null);
        updateMenuDrop(null);
        return [];
      }
      if (row && overItem) {
        updateIndicator(null);
        const rect = args.droppableRects.get(row.id);
        let mode: MenuDrop["mode"] = "nest";
        if (rect && point && rect.height > 0) {
          const rel = (point.y - rect.top) / rect.height;
          mode = rel < 1 / 3 ? "before" : rel > 2 / 3 ? "after" : "nest";
        }
        updateMenuDrop({ target: overItem, mode });
        return [row];
      }
      // Dropping back onto its own menu is a no-op revert — still highlight
      // the menu so it reads as a valid target (detectGesture returns null
      // for this, which the drop handler treats as a revert).
      if (overItem === activeRef.parent) {
        updateIndicator(null);
        updateMenuDrop(null);
        return nestHit(activeRef.parent);
      }
      // Over a same-level button's leading region it nests onto it.
      if (overItem && nests(overItem, zoneUnderPointer(ids) !== null)) {
        updateMenuDrop(null);
        if (nestArmed.current === overItem) updateIndicator(null);
        return nestOrHold(overItem, () => {
          const ins = point ? computeInsertion(args, ids, layout, point, openListOf) : null;
          return ins ? extractTo(ins) : [{ id: overItem }];
        });
      }
      // Otherwise surface an insertion gap and extract to that position.
      const ins = point ? computeInsertion(args, ids, layout, point, openListOf) : null;
      if (ins) return extractTo(ins);
      updateIndicator(null);
      updateMenuDrop(null);
      return nonNest;
    }

    updateIndicator(null);
    updateMenuDrop(null);
    const zone = zoneUnderPointer(ids);
    if (zone !== null) {
      const group = zoneGroup(openListOf(zone));
      const inside = listOf(layout, group);
      // Includes the dragged button's own slot, so a drop in place stays a no-op.
      const inner = pointer.find((c) => inside.includes(String(c.id)));
      if (!inner) return [{ id: groupDropId(group) }];
      return nests(String(inner.id), true) ? nestOrHold(String(inner.id), slotOf(String(inner.id))) : [inner];
    }
    const target = items[0];
    if (!target) {
      const row = nonNest.find((c) => isGroupDropId(String(c.id)));
      return row ? inRowGap(row) : nonNest;
    }
    return nests(String(target.id), false) ? nestOrHold(String(target.id), slotOf(String(target.id))) : [target];
  };
  const zones = [...layout.header, ...layout.footer].filter(isZoneItemId).map(zoneNameOfItem);
  const offering: CollisionDetection = (args) => {
    let offered: string | null = null;
    const result = detect(args, (target) => {
      offered = target;
    });
    offerNest(offered);
    return result;
  };
  // An armed nest changes the answer for a pointer that hasn't moved.
  return holdWhilePointerStill(offering, held, () => [nestArmed.current ?? "", ...zones.map(openListOf)].join("\n"));
}
