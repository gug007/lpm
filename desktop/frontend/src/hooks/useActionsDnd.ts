import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  type SensorDescriptor,
  type SensorOptions,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { ActionsLayout } from "../types";
import {
  type ActionGroup,
  applyMove,
  groupOf,
  resolveTarget,
  sameLayout,
} from "../components/actionsDndLayout";

export interface UseActionsDndOptions {
  layout: ActionsLayout;
  // Optimistic preview during drag — should NOT push undo / persist.
  onPreview: (next: ActionsLayout) => void;
  // Final commit on drop — pushes undo (using `baseline`) and persists.
  onMove: (next: ActionsLayout, baseline: ActionsLayout) => void;
}

export interface UseActionsDndResult {
  sensors: SensorDescriptor<SensorOptions>[];
  activeId: string | null;
  overGroup: ActionGroup | null;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragCancel: () => void;
  onDragEnd: (event: DragEndEvent) => void;
}

// 5px pointer activation lets a quick click pass through to onClick;
// touch needs a longer delay so taps don't accidentally pick up.
const POINTER_OPTS = { activationConstraint: { distance: 5 } } as const;
const TOUCH_OPTS = { activationConstraint: { delay: 200, tolerance: 8 } } as const;
const KEYBOARD_OPTS = { coordinateGetter: sortableKeyboardCoordinates } as const;

// Multi-container sortable: snapshot layout at drag-start, preview only
// when the dragged item's group changes (within-zone reorder is free
// via SortableContext), commit on drop with the snapshot as the undo
// baseline. Latest values reach handlers via refs because dnd-kit
// holds the handler reference for the whole drag.
export function useActionsDnd({ layout, onPreview, onMove }: UseActionsDndOptions): UseActionsDndResult {
  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_OPTS),
    useSensor(TouchSensor, TOUCH_OPTS),
    useSensor(KeyboardSensor, KEYBOARD_OPTS),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overGroup, setOverGroup] = useState<ActionGroup | null>(null);
  const baselineRef = useRef<ActionsLayout | null>(null);

  const layoutRef = useRef(layout);
  const onPreviewRef = useRef(onPreview);
  const onMoveRef = useRef(onMove);
  layoutRef.current = layout;
  onPreviewRef.current = onPreview;
  onMoveRef.current = onMove;

  // Drop the baseline if the component unmounts mid-drag so a stale
  // value can't leak into a remount.
  useEffect(() => () => { baselineRef.current = null; }, []);

  const onDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    setOverGroup(null);
    baselineRef.current = layoutRef.current;
  }, []);

  // Roll the optimistic preview back to the snapshot taken at drag
  // start. No-op when nothing was previewed.
  const revertToBaseline = useCallback((baseline: ActionsLayout) => {
    if (!sameLayout(layoutRef.current, baseline)) onPreviewRef.current(baseline);
  }, []);

  const onDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) {
      setOverGroup(null);
      return;
    }
    const currentLayout = layoutRef.current;
    const target = resolveTarget(String(over.id), currentLayout);
    setOverGroup(target?.group ?? null);
    if (!target || !baselineRef.current) return;
    const draggedId = String(active.id);
    // Within-zone moves are handled by SortableContext alone. Previewing
    // them too would feedback-loop: preview → re-shuffle → onDragOver →
    // preview … React bails with "Maximum update depth".
    if (groupOf(currentLayout, draggedId) === target.group) return;
    const next = applyMove(baselineRef.current, draggedId, target);
    if (sameLayout(currentLayout, next)) return;
    onPreviewRef.current(next);
  }, []);

  const onDragCancel = useCallback(() => {
    setActiveId(null);
    setOverGroup(null);
    const baseline = baselineRef.current;
    baselineRef.current = null;
    if (baseline) revertToBaseline(baseline);
  }, [revertToBaseline]);

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverGroup(null);
    const baseline = baselineRef.current;
    baselineRef.current = null;
    if (!baseline) return;
    const current = layoutRef.current;
    if (!over) return revertToBaseline(baseline);
    const draggedId = String(active.id);
    const overId = String(over.id);
    // Cursor on the dragged item's own placeholder: the preview already
    // represents where the user wants it to land — commit current as
    // final. (Without this, cross-zone drops snap back to baseline
    // because dnd-kit reports `over` as the active id.)
    if (draggedId === overId) {
      if (sameLayout(baseline, current)) return;
      onMoveRef.current(current, baseline);
      return;
    }
    const target = resolveTarget(overId, current);
    if (!target) return revertToBaseline(baseline);
    const final = applyMove(baseline, draggedId, target);
    if (sameLayout(baseline, final)) return revertToBaseline(baseline);
    onMoveRef.current(final, baseline);
  }, [revertToBaseline]);

  return useMemo(
    () => ({ sensors, activeId, overGroup, onDragStart, onDragOver, onDragCancel, onDragEnd }),
    [sensors, activeId, overGroup, onDragStart, onDragOver, onDragCancel, onDragEnd],
  );
}
