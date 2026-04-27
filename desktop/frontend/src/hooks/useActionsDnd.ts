import { useState } from "react";
import {
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { ActionsLayout } from "../types";
import { applyMove, resolveTarget, sameLayout } from "../components/actionsDndLayout";

export interface UseActionsDndOptions {
  layout: ActionsLayout;
  onMove: (next: ActionsLayout) => void;
}

export interface UseActionsDndResult {
  sensors: ReturnType<typeof useSensors>;
  activeId: string | null;
  onDragStart: (event: DragStartEvent) => void;
  onDragCancel: () => void;
  onDragEnd: (event: DragEndEvent) => void;
}

// Drives the actions DragOverlay/DndContext: tracks the in-flight id for
// the overlay, configures the standard pointer + keyboard sensors, and
// translates a drag-end into the next ActionsLayout via the pure helpers
// in actionsDndLayout.ts. 5 px pointer activation lets a quick click on a
// button still pass through to its onClick.
export function useActionsDnd({ layout, onMove }: UseActionsDndOptions): UseActionsDndResult {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  return {
    sensors,
    activeId,
    onDragStart: ({ active }) => setActiveId(String(active.id)),
    onDragCancel: () => setActiveId(null),
    onDragEnd: ({ active, over }) => {
      setActiveId(null);
      if (!over) return;
      const draggedId = String(active.id);
      const overId = String(over.id);
      if (draggedId === overId) return;
      const target = resolveTarget(overId, layout);
      if (!target) return;
      const next = applyMove(layout, draggedId, target);
      if (sameLayout(layout, next)) return;
      onMove(next);
    },
  };
}
