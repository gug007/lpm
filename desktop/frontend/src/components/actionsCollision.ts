import { type CollisionDetection, closestCenter, pointerWithin } from "@dnd-kit/core";
import type { ActionsLayout } from "../types";
import { isChildId, splitChild } from "../actionIds";
import {
  type ExtractIndicator,
  type MenuDrop,
  groupDropId,
  isCrumbId,
  isGroupDropId,
  isNestId,
  isZoneItemId,
  listOf,
  nestId,
  zoneGroup,
  zoneUnderPointer,
} from "./actionsDndLayout";
import { type HeldCollision, holdWhilePointerStill } from "./holdWhilePointerStill";

type CollisionArgs = Parameters<CollisionDetection>[0];

// Nest is the default while the pointer is in the leading part of a
// same-level button; the target only yields to a sortable reorder gap
// once the pointer crosses this fraction of its width in the drag
// direction. Lower = easier to reorder, higher = easier to nest.
const NEST_THRESHOLD = 0.45;

function inNestRegion(
  rect: { left: number; width: number },
  px: number,
  movingRight: boolean,
): boolean {
  const line = movingRight
    ? rect.left + rect.width * NEST_THRESHOLD
    : rect.left + rect.width * (1 - NEST_THRESHOLD);
  return movingRight ? px <= line : px >= line;
}

// Where a dragged-out menu item would land. A zone under the pointer takes it
// at its end, the next free slot; a row takes it at the gap between its
// buttons, from their measured midpoints so it matches what the user sees.
function computeInsertion(
  args: CollisionArgs,
  ids: string[],
  layout: ActionsLayout,
  px: number,
): ExtractIndicator | null {
  const zone = zoneUnderPointer(ids);
  if (zone !== null) {
    const group = zoneGroup(zone);
    return { group, index: listOf(layout, group).length };
  }
  const group = (["header", "footer"] as const).find((row) => ids.includes(groupDropId(row)));
  if (!group) return null;
  let index = 0;
  for (const id of listOf(layout, group)) {
    const r = args.droppableRects.get(id);
    if (!r) continue;
    if (px < r.left + r.width / 2) return { group, index };
    index += 1;
  }
  return { group, index };
}

export interface ActionsCollisionOptions {
  layout: ActionsLayout;
  // True when both actions live in the same config layer.
  canNest: (activeId: string, targetId: string) => boolean;
  updateIndicator: (next: ExtractIndicator | null) => void;
  updateMenuDrop: (next: MenuDrop | null) => void;
  // The answer a still pointer keeps; cleared when the drag ends.
  held: { current: HeldCollision | null };
}

// pointerWithin reports the item, its full-size nest zone, and the
// wrapping row. We pick exactly one: a top-level button nests until the
// pointer passes NEST_THRESHOLD then reorders; a menu item being dragged
// out nests onto a button's leading edge, otherwise opens an insertion gap
// and extracts to it. A dragged zone only moves among the header's and the
// footer's items, and a button over a zone lands inside it — never on the
// zone's frame.
export function createActionsCollision({
  layout,
  canNest,
  updateIndicator,
  updateMenuDrop,
  held,
}: ActionsCollisionOptions): CollisionDetection {
  const detect: CollisionDetection = (args) => {
    const active = String(args.active.id);
    const zoneDrag = isZoneItemId(active);
    // A dragged zone moves among the rows' items and onto the rows themselves;
    // a zone's frame is such an item, its buttons and drop area are not.
    const rowLevel = (id: string) =>
      id === groupDropId("header") || id === groupDropId("footer") || layout.header.includes(id) || layout.footer.includes(id);
    const pointer = pointerWithin(args);
    if (pointer.length === 0) {
      updateMenuDrop(null);
      // Hidden rows (footer under the config/notes view) register 0x0
      // rects that closestCenter would pick, committing invisible drops.
      // Without frames, a button nearest a zone joins it rather than taking
      // the zone's place in the header. Without nest drops, a release outside
      // everything reorders next to the nearest button instead of silently
      // nesting into it; a nest drop has its button's rect, so it wins ties.
      const measurable = args.droppableContainers.filter((c) => {
        const rect = c.rect.current;
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;
        const id = String(c.id);
        if (isNestId(id)) return false;
        return zoneDrag ? rowLevel(id) : !isZoneItemId(id);
      });
      return closestCenter({ ...args, droppableContainers: measurable });
    }
    if (zoneDrag) {
      updateIndicator(null);
      updateMenuDrop(null);
      // Includes its own slot, so a drop in place stays a no-op.
      const hit = pointer.find((c) => rowLevel(String(c.id)));
      return hit ? [hit] : [];
    }

    const ids = pointer.map((c) => String(c.id));
    const activeRef = splitChild(active);
    const nonNest = pointer.filter((c) => !isNestId(String(c.id)));
    const items = pointer.filter((c) => {
      const id = String(c.id);
      return !isGroupDropId(id) && !isNestId(id) && id !== active;
    });
    const nestHit = (name: string) => [{ id: nestId(name) }];
    const px = args.pointerCoordinates?.x ?? null;
    const py = args.pointerCoordinates?.y ?? null;
    const initialLeft = args.active.rect.current.initial?.left ?? args.collisionRect.left;
    const movingRight = args.collisionRect.left - initialLeft >= 0;
    // A zone's frame takes no nest drops: dropping there adds to the zone.
    const nests = (target: string) => {
      if (target === active || isChildId(target) || isZoneItemId(target)) return false;
      if (px === null || !canNest(active, target)) return false;
      const rect = args.droppableRects.get(target);
      return !!rect && inNestRegion(rect, px, movingRight);
    };

    if (activeRef) {
      // A breadcrumb under the pointer wins over the extract-to-toolbar
      // insertion: dropping there moves the child out one level.
      const crumbHit = pointer.find((c) => isCrumbId(String(c.id)));
      if (crumbHit) {
        updateIndicator(null);
        updateMenuDrop(null);
        return [{ id: crumbHit.id }];
      }
      const overItem = items[0] ? String(items[0].id) : null;
      // A child over a sibling row stays put (no shuffle). The pointer's
      // third within the row decides the action: top → reorder before,
      // bottom → reorder after, middle → nest into it. Recorded in menuDrop
      // for the drop handler and the row's insertion-line / nest highlight.
      if (overItem && isChildId(overItem)) {
        updateIndicator(null);
        const rect = args.droppableRects.get(items[0].id);
        let mode: MenuDrop["mode"] = "nest";
        if (rect && py != null && rect.height > 0) {
          const rel = (py - rect.top) / rect.height;
          mode = rel < 1 / 3 ? "before" : rel > 2 / 3 ? "after" : "nest";
        }
        updateMenuDrop({ target: overItem, mode });
        return [items[0]];
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
      if (overItem && nests(overItem)) {
        updateIndicator(null);
        updateMenuDrop(null);
        return nestHit(overItem);
      }
      // Otherwise surface an insertion gap and extract to that position.
      const ins = px === null ? null : computeInsertion(args, ids, layout, px);
      if (ins) {
        updateIndicator(ins);
        updateMenuDrop(null);
        const list = listOf(layout, ins.group);
        const anchor = list[Math.min(ins.index, list.length - 1)];
        return anchor ? [{ id: anchor }] : [{ id: groupDropId(ins.group) }];
      }
      updateIndicator(null);
      updateMenuDrop(null);
      return nonNest;
    }

    updateIndicator(null);
    updateMenuDrop(null);
    const zone = zoneUnderPointer(ids);
    if (zone !== null) {
      const inside = listOf(layout, zoneGroup(zone));
      // Includes the dragged button's own slot, so a drop in place stays a no-op.
      const inner = pointer.find((c) => inside.includes(String(c.id)));
      if (!inner) return [{ id: groupDropId(zoneGroup(zone)) }];
      return nests(String(inner.id)) ? nestHit(String(inner.id)) : [inner];
    }
    const target = items[0];
    if (!target) return nonNest;
    return nests(String(target.id)) ? nestHit(String(target.id)) : [target];
  };
  return holdWhilePointerStill(detect, held);
}
