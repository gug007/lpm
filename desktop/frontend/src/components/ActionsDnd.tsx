import { type CSSProperties, type ReactNode, createContext, useContext, useMemo } from "react";
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
import { useActionsDnd } from "../hooks/useActionsDnd";
import { useActionsDropZone } from "../hooks/useActionsDropZone";
import { type ActionGroup, ZONE_ID, isZoneId, isNestId, nestId } from "./actionsDndLayout";
import { useDragBodyAttribute } from "../hooks/useDragBodyAttribute";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

interface ActionsDndProps {
  layout: ActionsLayout;
  // baseline is the layout at drag-start so the undo entry survives
  // intermediate previews.
  onMove: (next: ActionsLayout, baseline: ActionsLayout) => void;
  onPreview: (next: ActionsLayout) => void;
  onStructural: (op: StructuralOp) => void;
  // Returns the config level of an action id, or null. Used to gate which
  // items are valid nest targets while dragging.
  levelOf: (id: string) => "project" | "repo" | "global" | null;
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

export function ActionsDnd({
  layout,
  onMove,
  onPreview,
  onStructural,
  levelOf,
  isMenu,
  renderOverlay,
  children,
}: ActionsDndProps) {
  const { sensors, activeId, overGroup, onDragStart, onDragOver, onDragCancel, onDragEnd } =
    useActionsDnd({ layout, onMove, onPreview, onStructural, levelOf, isMenu });
  const reduceMotion = usePrefersReducedMotion();
  useDragBodyAttribute(activeId !== null);

  // Nest is the default while the pointer is in the leading part of a
  // same-level button; the target only yields to a sortable reorder gap
  // once the pointer crosses this fraction of its width in the drag
  // direction. Lower = easier to reorder, higher = easier to nest.
  const NEST_THRESHOLD = 0.45;

  // pointerWithin reports the item, its full-size nest zone, and the
  // wrapping row zone. We pick exactly one: a child reorders/extracts; a
  // top-level button nests until the pointer passes NEST_THRESHOLD in the
  // drag direction, then it reorders (the sortable list opens the gap).
  // closestCenter falls back when pointerWithin matches nothing.
  const collisionDetection = useMemo<CollisionDetection>(
    () => (args) => {
      const pointer = pointerWithin(args);
      if (pointer.length === 0) {
        // Hidden zones (footer under the config/notes view) register 0x0
        // rects that closestCenter would pick, committing invisible drops.
        const measurable = args.droppableContainers.filter((c) => {
          const rect = c.rect.current;
          return !!rect && rect.width > 0 && rect.height > 0;
        });
        return closestCenter({ ...args, droppableContainers: measurable });
      }

      const active = String(args.active.id);
      const activeLevel = levelOf(active);
      const activeIsChild = active.includes(":");
      const nonNest = pointer.filter((c) => !isNestId(String(c.id)));
      const items = pointer.filter((c) => {
        const id = String(c.id);
        return !isZoneId(id) && !isNestId(id) && id !== active;
      });
      const targetCollision = items[0];
      if (!targetCollision) return nonNest;
      const target = String(targetCollision.id);
      const nestHit = (name: string) =>
        pointer.find((c) => String(c.id) === nestId(name)) ?? { id: nestId(name) };

      if (activeIsChild) {
        // A child over a sibling reorders within the open menu; over a
        // same-level top-level button it nests (extracts onto it).
        if (target.includes(":")) return [targetCollision];
        const parent = active.slice(0, active.indexOf(":"));
        const canNest =
          target !== parent && activeLevel !== null && levelOf(target) === activeLevel;
        return canNest ? [nestHit(target)] : [targetCollision];
      }

      if (!target.includes(":")) {
        const canNest = activeLevel !== null && levelOf(target) === activeLevel;
        const rect = args.droppableRects.get(targetCollision.id);
        const px = args.pointerCoordinates?.x;
        if (canNest && rect && px != null) {
          const initialLeft = args.active.rect.current.initial?.left ?? args.collisionRect.left;
          const movingRight = args.collisionRect.left - initialLeft >= 0;
          const line = movingRight
            ? rect.left + rect.width * NEST_THRESHOLD
            : rect.left + rect.width * (1 - NEST_THRESHOLD);
          const reorder = movingRight ? px > line : px < line;
          if (!reorder) return [nestHit(target)];
        }
      }
      return [targetCollision];
    },
    [activeId, levelOf],
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
          {children}
        </div>
      </ZoneContext.Provider>
    </SortableContext>
  );
}
