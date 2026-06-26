import { type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useActionsZone } from "./ActionsDnd";
import { NestDropZone } from "./NestDropZone";
import { nestId } from "./actionsDndLayout";
import { SpringOverContext } from "./springLoad";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

interface ActionsSortableItemProps {
  id: string;
  children: ReactNode;
}

// No {...attributes} spread: it would make the wrapper a focusable
// role="button" around the real button, which WebKit then focuses on
// click — pairing badly with any keyboard activator and confusing
// assistive tech with nested buttons.
export function ActionsSortableItem({ id, children }: ActionsSortableItemProps) {
  const reduceMotion = usePrefersReducedMotion();
  const compact = useActionsZone() === "footer";
  const { listeners, setNodeRef, transform, transition, isDragging, over } = useSortable({
    id,
    transition: reduceMotion ? null : undefined,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  // True when the pointer dwells over this button — either its reorder slot or
  // its nest zone. Lets a menu trigger inside spring its dropdown open.
  const springOver =
    !isDragging && over != null && (over.id === id || over.id === nestId(id));
  // Outline, not border: paint-only, so siblings don't shift at lift-off.
  const wrapperClass = isDragging
    ? `relative ${compact ? "rounded-md" : "rounded-lg"} outline-2 -outline-offset-2 outline-dashed outline-[var(--accent-blue)]/50 cursor-grabbing [&>*]:opacity-0`
    : "relative cursor-grab";
  return (
    <div ref={setNodeRef} style={style} className={wrapperClass} {...listeners}>
      <SpringOverContext.Provider value={springOver}>
        {children}
      </SpringOverContext.Provider>
      <NestDropZone targetId={id} />
    </div>
  );
}
