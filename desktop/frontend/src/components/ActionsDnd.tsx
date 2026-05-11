import { type CSSProperties, type ReactNode } from "react";
import {
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
  // Final commit (push undo + persist). `baseline` is the layout at
  // drag-start, so the undo entry is correct even after preview moves.
  onMove: (next: ActionsLayout, baseline: ActionsLayout) => void;
  // Optimistic preview during drag (no undo, no persist). Drives the
  // multi-container sortable feel — siblings in the destination zone
  // shift to make room as the cursor crosses zones.
  onPreview: (next: ActionsLayout) => void;
  // Renders the dragged item inside DragOverlay. Required because the
  // dragged button leaves its source container (header → footer or
  // vice-versa); without an overlay it ends up clipped or painted under
  // sibling regions like the terminal view. `overGroup` lets the caller
  // preview the destination form factor (header = full, footer = compact)
  // while the user is mid-drag across zones.
  renderOverlay: (id: string, overGroup: ActionGroup | null) => ReactNode;
  children: ReactNode;
}

// pointerWithin gives crisp "what's under my cursor" feedback for
// cross-zone drops (header ↔ footer). When the cursor sits on an item,
// pointerWithin reports BOTH that item AND the zone wrapping it; we
// prefer the item so the per-item insertion line marks the precise drop
// spot. Bare zone wins only when the cursor is in empty zone area
// (drop-at-end). closestCenter is the fallback for keyboard sort and
// for the rare gap where pointerWithin matches nothing.
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

// When the user has prefers-reduced-motion set, drop instantly with no
// overshoot so the UI doesn't move more than necessary.
const reducedMotionDropAnimation = {
  ...defaultDropAnimation,
  duration: 0,
  easing: "linear",
};

// Resolve a drag target id into a phrase a screen reader can read out.
// Synthetic zone ids ("actions-zone:header") get translated to the
// human-readable group name; real action ids stay as-is.
function describeTarget(id: string | number): string {
  const s = String(id);
  if (s === ZONE_ID.header) return "the header row";
  if (s === ZONE_ID.footer) return "the footer row";
  return s;
}

const accessibility = {
  announcements: {
    onDragStart({ active }: { active: { id: string | number } }) {
      return `Picked up action ${active.id}.`;
    },
    onDragOver({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) {
      if (!over) return `Action ${active.id} is no longer over a drop zone.`;
      return `Action ${active.id} is over ${describeTarget(over.id)}.`;
    },
    onDragEnd({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) {
      if (!over) return `Action ${active.id} was dropped.`;
      return `Action ${active.id} was dropped on ${describeTarget(over.id)}.`;
    },
    onDragCancel({ active }: { active: { id: string | number } }) {
      return `Action drag cancelled. Action ${active.id} returned to its original position.`;
    },
  },
  screenReaderInstructions: {
    draggable:
      "To pick up an action, press space or enter. While dragging, use the arrow keys to move the action between zones. Press space or enter again to drop, or press escape to cancel.",
  },
};

// Module-scoped — passing a fresh object each render forces dnd-kit's
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
      // Horizontal-only auto-scroll for the action rows; vertical scroll is disabled.
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
