import { useCallback, useEffect, useRef, useState } from "react";
import {
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  PointerSensor,
  type SensorDescriptor,
  type SensorOptions,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
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
  // No undo, no persist — repeated mid-drag.
  onPreview: (next: ActionsLayout) => void;
  // Pushes undo against baseline and persists — fired once on drop.
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

// The activation threshold lets a quick click pass through to onClick
// rather than start a drag. Pointer only: keyboard and touch sensors
// are deliberately absent — without a dedicated drag handle, dnd-kit's
// KeyboardSensor hijacks Enter/Space on the buttons and starts a drag
// that mouse input can never end, leaving a stuck overlay that blocks
// clicks.
const POINTER_OPTS = { activationConstraint: { distance: 5 } } as const;

// Multi-container sortable: snapshot layout at drag-start, preview only
// on cross-zone moves (within-zone reorder rides on SortableContext for
// free), commit on drop against the snapshot. Handlers read live values
// via refs because dnd-kit holds the handler reference for the whole drag.
export function useActionsDnd({ layout, onPreview, onMove }: UseActionsDndOptions): UseActionsDndResult {
  const sensors = useSensors(useSensor(PointerSensor, POINTER_OPTS));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overGroup, setOverGroup] = useState<ActionGroup | null>(null);
  const baselineRef = useRef<ActionsLayout | null>(null);

  const layoutRef = useRef(layout);
  const onPreviewRef = useRef(onPreview);
  const onMoveRef = useRef(onMove);
  layoutRef.current = layout;
  onPreviewRef.current = onPreview;
  onMoveRef.current = onMove;

  // Prevent a stale baseline from leaking across an unmount mid-drag.
  useEffect(() => () => { baselineRef.current = null; }, []);

  const onDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    setOverGroup(null);
    baselineRef.current = layoutRef.current;
  }, []);

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

  return { sensors, activeId, overGroup, onDragStart, onDragOver, onDragCancel, onDragEnd };
}
