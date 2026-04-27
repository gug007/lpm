import { type CSSProperties, type ReactNode } from "react";
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import type { ActionsLayout } from "../types";
import { useActionsDnd } from "../hooks/useActionsDnd";
import { useActionsDropZone } from "../hooks/useActionsDropZone";
import type { ActionGroup } from "./actionsDndLayout";

interface ActionsDndProps {
  layout: ActionsLayout;
  onMove: (next: ActionsLayout) => void;
  // Renders the dragged item inside DragOverlay. Required because the
  // dragged button leaves its source container (header → footer or
  // vice-versa); without an overlay it ends up clipped or painted under
  // sibling regions like the terminal view.
  renderOverlay: (id: string) => ReactNode;
  children: ReactNode;
}

export function ActionsDnd({ layout, onMove, renderOverlay, children }: ActionsDndProps) {
  const { sensors, activeId, onDragStart, onDragCancel, onDragEnd } = useActionsDnd({ layout, onMove });
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragCancel={onDragCancel}
      onDragEnd={onDragEnd}
    >
      {children}
      <DragOverlay>{activeId ? renderOverlay(activeId) : null}</DragOverlay>
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

export function ActionsGroup({ group, ids, className, style, children }: ActionsGroupProps) {
  const { setNodeRef, hintClass } = useActionsDropZone(group);
  return (
    <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
      <div
        ref={setNodeRef}
        className={`${className ?? ""} transition-[box-shadow,background-color] ${hintClass}`}
        style={style}
      >
        {children}
      </div>
    </SortableContext>
  );
}
