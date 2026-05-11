import { type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ActionsSortableItemProps {
  id: string;
  children: ReactNode;
}

export function ActionsSortableItem({ id, children }: ActionsSortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  // Drop position is conveyed by the dashed placeholder where the
  // dragged item will land plus the sibling-shift from SortableContext —
  // no extra insertion bar needed.
  const wrapperClass = isDragging
    ? "border-2 border-dashed border-[var(--accent-blue)]/50 rounded-md cursor-grabbing"
    : "cursor-grab";
  const childStyle: React.CSSProperties | undefined = isDragging ? { opacity: 0 } : undefined;
  return (
    <div ref={setNodeRef} style={style} className={wrapperClass} {...attributes} {...listeners}>
      <div style={childStyle}>{children}</div>
    </div>
  );
}
