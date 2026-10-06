import { type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useActionGroup } from "./ActionsGroup";
import { useActionsSettlingId } from "./ActionsDnd";
import { NestDropZone } from "./NestDropZone";
import { nestId } from "./actionsDndLayout";
import { SpringOverContext } from "./springLoad";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { isMac } from "../platform";

interface ActionsSortableItemProps {
  id: string;
  // A zone's frame takes no nest drops: dropping there adds to the zone.
  nestable?: boolean;
  // Re-measured when this item resizes mid-drag, in place of dnd-kit's
  // default: the items after it.
  remeasureOnResize?: string[];
  className?: string;
  children: ReactNode;
}

// No {...attributes} spread: it would make the wrapper a focusable
// role="button" around the real button, which WebKit then focuses on
// click — pairing badly with any keyboard activator and confusing
// assistive tech with nested buttons.
export function ActionsSortableItem({
  id,
  nestable = true,
  remeasureOnResize,
  className = "",
  children,
}: ActionsSortableItemProps) {
  const reduceMotion = usePrefersReducedMotion();
  const compact = useActionGroup() !== "header";
  const settling = useActionsSettlingId() === id;
  const { listeners, setNodeRef, transform, transition, isDragging, over } = useSortable({
    id,
    transition: reduceMotion ? null : undefined,
    resizeObserverConfig: remeasureOnResize && { updateMeasurementsFor: remeasureOnResize },
  });
  // Translate only: a zone's grid strategy also scales an item to the size of
  // the slot it moves into, which squashes or stretches its label.
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };
  // A split button's dropdown is portaled out of this wrapper, but React still
  // bubbles its presses here: one on the menu's own chrome (title, padding)
  // must not pick up the button the menu belongs to.
  const pickUp = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("[data-actions-menu]")) return;
    listeners?.onPointerDown?.(e);
  };
  // On macOS a control-click is a right-click: it opens the button's menu, and
  // the click WebKit still sends after it must not also run the action.
  const skipControlClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!isMac || !e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
  };
  // True while a nest into this button is armed: the pointer has rested on
  // it. Lets a menu trigger inside spring its dropdown open.
  const springOver = !isDragging && over != null && over.id === nestId(id);
  // Outline, not border: paint-only, so siblings don't shift at lift-off.
  const rounded = compact ? "rounded-md" : "rounded-lg";
  const wrapperClass = isDragging
    ? `relative ${rounded} outline-2 -outline-offset-2 outline-dashed outline-[var(--accent-blue)]/50 cursor-grabbing [&>*]:opacity-0 ${className}`
    : `relative cursor-grab ${settling ? "opacity-0" : ""} ${className}`;
  return (
    <div ref={setNodeRef} style={style} className={wrapperClass} {...listeners} onPointerDown={pickUp} onClickCapture={skipControlClick}>
      <SpringOverContext.Provider value={springOver}>
        {children}
      </SpringOverContext.Provider>
      {nestable && <NestDropZone targetId={id} rounded={rounded} />}
    </div>
  );
}
