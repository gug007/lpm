import {
  Children,
  type CSSProperties,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type Announcements,
  type CollisionDetection,
  DndContext,
  DragOverlay,
  closestCenter,
  defaultDropAnimation,
  pointerWithin,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import type { ActionsLayout } from "../types";
import type { StructuralOp } from "../actionsGesture";
import { isChildId, splitChild } from "../actionIds";
import { useActionsDnd } from "../hooks/useActionsDnd";
import { useActionsDropZone } from "../hooks/useActionsDropZone";
import {
  type ActionGroup,
  type ExtractIndicator,
  type MenuDrop,
  ZONE_ID,
  isZoneId,
  isNestId,
  isCrumbId,
  nestId,
} from "./actionsDndLayout";
import { ExtractPlaceholder } from "./ExtractPlaceholder";
import { useDragBodyAttribute } from "../hooks/useDragBodyAttribute";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

// While dragging a menu item out, this reports the row + gap it would land
// in, so the row can open an insertion placeholder. null when not extracting.
const ExtractIndicatorContext = createContext<ExtractIndicator | null>(null);

export function useExtractIndicator(): ExtractIndicator | null {
  return useContext(ExtractIndicatorContext);
}

// While dragging a row within an open drill menu, this reports which sibling
// the pointer is over and the action (before/after/nest). Rows read it to draw
// the insertion line or nest highlight. null when not over a sibling row.
const MenuDropContext = createContext<MenuDrop | null>(null);

export function useMenuDrop(): MenuDrop | null {
  return useContext(MenuDropContext);
}

// The id of the row currently being dragged, so menu rows can ghost themselves
// in place (they're plain droppables now, not sortables that move out of view).
const ActiveIdContext = createContext<string | null>(null);

export function useActionsActiveId(): string | null {
  return useContext(ActiveIdContext);
}

// Which row the pointer is in and the gap index between its buttons. Uses
// the measured droppable rects so it matches what the user sees.
function computeInsertion(
  args: Parameters<CollisionDetection>[0],
  layout: ActionsLayout,
  px: number,
  py: number,
): ExtractIndicator | null {
  const groups: ActionGroup[] = ["header", "footer"];
  for (const group of groups) {
    const zoneRect = args.droppableRects.get(ZONE_ID[group]);
    if (!zoneRect) continue;
    if (px < zoneRect.left || px > zoneRect.right || py < zoneRect.top || py > zoneRect.bottom) {
      continue;
    }
    const ids = group === "header" ? layout.header : layout.footer;
    let index = 0;
    for (const id of ids) {
      const r = args.droppableRects.get(id);
      if (!r) continue;
      if (px < r.left + r.width / 2) return { group, index };
      index += 1;
    }
    return { group, index };
  }
  return null;
}

interface ActionsDndProps {
  layout: ActionsLayout;
  onMove: (next: ActionsLayout) => void;
  onPreview: (next: ActionsLayout) => void;
  onStructural: (op: StructuralOp) => void;
  // True when both actions live in the same config layer. Gates which
  // items are valid nest targets while dragging.
  canNest: (activeId: string, targetId: string) => boolean;
  isMenu: (id: string) => boolean;
  renderOverlay: (id: string, overGroup: ActionGroup | null) => ReactNode;
  children: ReactNode;
}

const dropAnimation = {
  ...defaultDropAnimation,
  duration: 250,
  easing: "cubic-bezier(0.18, 0.89, 0.32, 1.28)",
};

const reducedMotionDropAnimation = {
  ...defaultDropAnimation,
  duration: 0,
  easing: "linear",
};

function describeTarget(id: string | number): string {
  const s = String(id);
  if (s === ZONE_ID.header) return "the header row";
  if (s === ZONE_ID.footer) return "the footer row";
  return s;
}

const announcements: Announcements = {
  onDragStart: ({ active }) => `Picked up action ${active.id}.`,
  onDragOver: ({ active, over }) =>
    over
      ? `Action ${active.id} is over ${describeTarget(over.id)}.`
      : `Action ${active.id} is no longer over a drop zone.`,
  onDragEnd: ({ active, over }) =>
    over
      ? `Action ${active.id} was dropped on ${describeTarget(over.id)}.`
      : `Action ${active.id} was dropped.`,
  onDragCancel: ({ active }) =>
    `Action drag cancelled. Action ${active.id} returned to its original position.`,
};

const accessibility = { announcements };

// Not useDndContext: dnd-kit's public context changes identity every
// pointermove; this boolean flips only at drag start/end.
const DragActiveContext = createContext(false);

export function useActionsDragActive(): boolean {
  return useContext(DragActiveContext);
}

const ZoneContext = createContext<ActionGroup>("header");

export function useActionsZone(): ActionGroup {
  return useContext(ZoneContext);
}

// Module-scoped — a fresh object each render would force dnd-kit's
// useAutoScroller to teardown/setup on every parent re-render.
const autoScrollOptions = {
  threshold: { x: 0.15, y: 0 },
  acceleration: 8,
  layoutShiftCompensation: false,
} as const;

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

export function ActionsDnd({
  layout,
  onMove,
  onPreview,
  onStructural,
  canNest,
  isMenu,
  renderOverlay,
  children,
}: ActionsDndProps) {
  const [indicator, setIndicator] = useState<ExtractIndicator | null>(null);
  const indicatorRef = useRef<ExtractIndicator | null>(null);
  const updateIndicator = useCallback((next: ExtractIndicator | null) => {
    const prev = indicatorRef.current;
    if (prev?.group === next?.group && prev?.index === next?.index) return;
    indicatorRef.current = next;
    setIndicator(next);
  }, []);

  const [menuDrop, setMenuDrop] = useState<MenuDrop | null>(null);
  const menuDropRef = useRef<MenuDrop | null>(null);
  const updateMenuDrop = useCallback((next: MenuDrop | null) => {
    const prev = menuDropRef.current;
    if (prev?.target === next?.target && prev?.mode === next?.mode) return;
    menuDropRef.current = next;
    setMenuDrop(next);
  }, []);

  const { sensors, activeId, overGroup, onDragStart, onDragOver, onDragCancel, onDragEnd } =
    useActionsDnd({ layout, onMove, onPreview, onStructural, canNest, isMenu, indicatorRef, menuDropRef });
  const reduceMotion = usePrefersReducedMotion();
  useDragBodyAttribute(activeId !== null);

  useEffect(() => {
    if (activeId === null) {
      updateIndicator(null);
      menuDropRef.current = null;
      setMenuDrop(null);
    }
  }, [activeId, updateIndicator]);

  // pointerWithin reports the item, its full-size nest zone, and the
  // wrapping row zone. We pick exactly one: a top-level button nests until
  // the pointer passes NEST_THRESHOLD then reorders; a menu item being
  // dragged out nests onto a button's leading edge, otherwise opens an
  // insertion gap between buttons and extracts to that position.
  const collisionDetection = useMemo<CollisionDetection>(
    () => (args) => {
      const pointer = pointerWithin(args);
      if (pointer.length === 0) {
        updateMenuDrop(null);
        // Hidden zones (footer under the config/notes view) register 0x0
        // rects that closestCenter would pick, committing invisible drops.
        const measurable = args.droppableContainers.filter((c) => {
          const rect = c.rect.current;
          return !!rect && rect.width > 0 && rect.height > 0;
        });
        return closestCenter({ ...args, droppableContainers: measurable });
      }

      const active = String(args.active.id);
      const activeRef = splitChild(active);
      const nonNest = pointer.filter((c) => !isNestId(String(c.id)));
      const items = pointer.filter((c) => {
        const id = String(c.id);
        return !isZoneId(id) && !isNestId(id) && id !== active;
      });
      const nestHit = (name: string) => [{ id: nestId(name) }];
      const px = args.pointerCoordinates?.x ?? null;
      const py = args.pointerCoordinates?.y ?? null;
      const initialLeft = args.active.rect.current.initial?.left ?? args.collisionRect.left;
      const movingRight = args.collisionRect.left - initialLeft >= 0;

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
        if (overItem && canNest(active, overItem) && px != null) {
          const rect = args.droppableRects.get(items[0].id);
          if (rect && inNestRegion(rect, px, movingRight)) {
            updateIndicator(null);
            updateMenuDrop(null);
            return nestHit(overItem);
          }
        }
        // Otherwise surface an insertion gap and extract to that position.
        if (px != null && py != null) {
          const ins = computeInsertion(args, layout, px, py);
          if (ins) {
            updateIndicator(ins);
            updateMenuDrop(null);
            const ids = ins.group === "header" ? layout.header : layout.footer;
            const anchor = ids[Math.min(ins.index, ids.length - 1)];
            return anchor ? [{ id: anchor }] : [{ id: ZONE_ID[ins.group] }];
          }
        }
        updateIndicator(null);
        updateMenuDrop(null);
        return nonNest;
      }

      updateIndicator(null);
      updateMenuDrop(null);
      const targetCollision = items[0];
      if (!targetCollision) return nonNest;
      const target = String(targetCollision.id);

      if (!isChildId(target) && canNest(active, target) && px != null) {
        const rect = args.droppableRects.get(targetCollision.id);
        if (rect && inNestRegion(rect, px, movingRight)) return nestHit(target);
      }
      return [targetCollision];
    },
    [canNest, layout, updateIndicator, updateMenuDrop],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragCancel={onDragCancel}
      onDragEnd={onDragEnd}
      accessibility={accessibility}
      autoScroll={autoScrollOptions}
    >
      <DragActiveContext.Provider value={activeId !== null}>
       <ActiveIdContext.Provider value={activeId}>
       <ExtractIndicatorContext.Provider value={indicator}>
       <MenuDropContext.Provider value={menuDrop}>
        {children}
        {/* pointer-events-none must sit on DragOverlay itself: it lands on
            the position:fixed wrapper dnd-kit hit-tests, so the overlay can
            never swallow clicks aimed at the buttons beneath it. On a child
            div it has no effect — the wrapper still intercepts. */}
        <DragOverlay
          className="pointer-events-none"
          dropAnimation={reduceMotion ? reducedMotionDropAnimation : dropAnimation}
        >
          {activeId ? (
            <div
              className="lpm-actions-overlay"
              style={{ transform: reduceMotion ? undefined : "scale(1.04) rotate(-1.5deg)" }}
            >
              {renderOverlay(activeId, overGroup)}
            </div>
          ) : null}
        </DragOverlay>
       </MenuDropContext.Provider>
       </ExtractIndicatorContext.Provider>
       </ActiveIdContext.Provider>
      </DragActiveContext.Provider>
    </DndContext>
  );
}

interface ActionsGroupProps {
  group: ActionGroup;
  ids: string[];
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

function EmptyDropHint() {
  const dragging = useActionsDragActive();
  const compact = useActionsZone() === "footer";
  if (!dragging) return null;
  return (
    <div
      className={`flex items-center border border-dashed border-[var(--accent-blue)]/50 px-2 text-center text-[10px] text-[var(--accent-blue)] ${compact ? "h-6 rounded-md" : "h-7 rounded-lg"}`}
    >
      Drop here
    </div>
  );
}

export function ActionsGroup({ group, ids, className, style, children }: ActionsGroupProps) {
  const { setNodeRef, hintClass } = useActionsDropZone(group);
  const indicator = useExtractIndicator();
  let content: ReactNode = children;
  if (indicator && indicator.group === group) {
    const arr = Children.toArray(children);
    const i = Math.max(0, Math.min(indicator.index, arr.length));
    arr.splice(i, 0, <ExtractPlaceholder key="extract-placeholder" compact={group === "footer"} />);
    content = arr;
  }
  return (
    <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
      <ZoneContext.Provider value={group}>
        <div
          ref={setNodeRef}
          data-actions-zone={group}
          className={`${className ?? ""} ${hintClass}`}
          style={style}
        >
          {ids.length === 0 && <EmptyDropHint />}
          {content}
        </div>
      </ZoneContext.Provider>
    </SortableContext>
  );
}
