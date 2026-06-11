import { type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ActionsSortableItemProps {
  id: string;
  children: ReactNode;
}

// No {...attributes} spread: it would make the wrapper a focusable
// role="button" around the real button, which WebKit then focuses on
// click — pairing badly with any keyboard activator and confusing
// assistive tech with nested buttons.
export function ActionsSortableItem({ id, children }: ActionsSortableItemProps) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const wrapperClass = isDragging
    ? "rounded-md border-2 border-dashed border-[var(--accent-blue)]/50 cursor-grabbing [&>*]:opacity-0"
    : "cursor-grab";
  return (
    <div ref={setNodeRef} style={style} className={wrapperClass} {...listeners}>
      {children}
    </div>
  );
}
