import { type ReactNode } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type SortableDirection = "vertical" | "horizontal";

interface SortableListProps {
  ids: string[];
  direction?: SortableDirection;
  onReorder: (order: string[]) => void;
  children: ReactNode;
}

// 5px pointer activation distance lets a quick click on a sortable item
// pass through to its onClick handler — only deliberate drags engage the
// sort.
export function SortableList({ ids, direction = "vertical", onReorder, children }: SortableListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    const next = ids.slice();
    const [moved] = next.splice(oldIdx, 1);
    next.splice(newIdx, 0, moved);
    onReorder(next);
  };

  const strategy =
    direction === "horizontal" ? horizontalListSortingStrategy : verticalListSortingStrategy;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={strategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

interface SortableItemProps {
  id: string;
  children: ReactNode;
}

export function SortableItem({ id, children }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}
