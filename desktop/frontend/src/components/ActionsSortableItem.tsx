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
  const wrapperClass = isDragging
    ? "rounded-md border-2 border-dashed border-[var(--accent-blue)]/50 cursor-grabbing [&>*]:opacity-0"
    : "cursor-grab";
  return (
    <div ref={setNodeRef} style={style} className={wrapperClass} {...attributes} {...listeners}>
      {children}
    </div>
  );
}
