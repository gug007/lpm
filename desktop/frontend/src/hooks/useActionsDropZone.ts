import { useDroppable } from "@dnd-kit/core";
import { groupDropId, type ActionGroup } from "../components/actionsDndLayout";

// Same outline pair in both states so the over-state crossfades in.
// Transition only the hint's own paint properties — not layout. The header
// row toggles flex-grow while dragging, and `transition-all` would animate
// that width change, sliding the buttons around on drop.
const HINT_BASE =
  "transition-[outline-color,outline-width,background-color] duration-150";
const HINT_AVAILABLE =
  "outline-1 -outline-offset-1 outline-dashed outline-[var(--accent-blue)]/30 bg-[var(--accent-blue)]/[0.03]";
const HINT_OVER =
  "outline-2 -outline-offset-1 outline-dashed outline-[var(--accent-blue)] bg-[var(--accent-blue)]/10";

export interface UseActionsDropZoneResult {
  setNodeRef: (node: HTMLElement | null) => void;
  hintClass: string;
}

export function useActionsDropZone(group: ActionGroup, disabled = false): UseActionsDropZoneResult {
  const { setNodeRef, isOver, active } = useDroppable({ id: groupDropId(group), disabled });
  const stateClass = disabled ? "" : isOver ? HINT_OVER : active ? HINT_AVAILABLE : "";
  const hintClass = stateClass ? `${HINT_BASE} ${stateClass}` : HINT_BASE;
  return { setNodeRef, hintClass };
}
