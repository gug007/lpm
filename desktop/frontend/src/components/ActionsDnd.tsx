import { type CSSProperties, type ReactNode, createContext, useContext } from "react";
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
import { useActionsDnd } from "../hooks/useActionsDnd";
import { useActionsDropZone } from "../hooks/useActionsDropZone";
import { type ActionGroup, ZONE_ID, isZoneId } from "./actionsDndLayout";
import { useDragBodyAttribute } from "../hooks/useDragBodyAttribute";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

interface ActionsDndProps {
  layout: ActionsLayout;
  // baseline is the layout at drag-start so the undo entry survives
  // intermediate previews.
  onMove: (next: ActionsLayout, baseline: ActionsLayout) => void;
  onPreview: (next: ActionsLayout) => void;
  renderOverlay: (id: string, overGroup: ActionGroup | null) => ReactNode;
  children: ReactNode;
}

// pointerWithin reports both the item under the cursor AND the zone
// wrapping it; preferring the item makes drop-on-item land precisely
// while a bare-zone match means drop-at-end. closestCenter falls back
// for the rare gap where pointerWithin matches none.
const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  if (pointer.length > 0) {
    const items = pointer.filter((c) => !isZoneId(String(c.id)));
    return items.length > 0 ? items : pointer;
  }
  // Hidden zones (footer under the config/notes view) register 0x0
  // rects that closestCenter would pick, committing invisible drops.
  const measurable = args.droppableContainers.filter((c) => {
    const rect = c.rect.current;
    return !!rect && rect.width > 0 && rect.height > 0;
  });
  return closestCenter({ ...args, droppableContainers: measurable });
};

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

export function ActionsDnd({ layout, onMove, onPreview, renderOverlay, children }: ActionsDndProps) {
  const { sensors, activeId, overGroup, onDragStart, onDragOver, onDragCancel, onDragEnd } =
    useActionsDnd({ layout, onMove, onPreview });
  const reduceMotion = usePrefersReducedMotion();
  useDragBodyAttribute(activeId !== null);
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
