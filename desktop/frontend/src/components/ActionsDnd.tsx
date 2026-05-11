import { type CSSProperties, type ReactNode } from "react";
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
// for keyboard sort and the rare gap where pointerWithin matches none.
const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  if (pointer.length > 0) {
    const items = pointer.filter((c) => !isZoneId(String(c.id)));
    return items.length > 0 ? items : pointer;
  }
  return closestCenter(args);
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

const screenReaderInstructions = {
  draggable:
    "To pick up an action, press space or enter. While dragging, use the arrow keys to move the action between zones. Press space or enter again to drop, or press escape to cancel.",
};

const accessibility = { announcements, screenReaderInstructions };

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
      {children}
      <DragOverlay dropAnimation={reduceMotion ? reducedMotionDropAnimation : dropAnimation}>
        {activeId ? (
          <div
            className="lpm-actions-overlay shadow-2xl cursor-grabbing pointer-events-none"
            style={{ transform: reduceMotion ? undefined : "scale(1.04) rotate(-1.5deg)" }}
          >
            {renderOverlay(activeId, overGroup)}
          </div>
        ) : null}
      </DragOverlay>
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

export function EmptyDropHint() {
  return (
    <div className="rounded-md border border-dashed border-[var(--border)] px-2 py-1 text-center text-[10px] text-[var(--text-muted)]">
      Drop here
    </div>
  );
}

export function ActionsGroup({ group, ids, className, style, children }: ActionsGroupProps) {
  const { setNodeRef, hintClass } = useActionsDropZone(group);
  return (
    <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
      <div
        ref={setNodeRef}
        className={`${className ?? ""} ${hintClass}`}
        style={style}
      >
        {children}
      </div>
    </SortableContext>
  );
}
