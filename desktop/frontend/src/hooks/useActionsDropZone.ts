import { useDroppable } from "@dnd-kit/core";
import { ZONE_ID, type ActionGroup } from "../components/actionsDndLayout";

// Both groups read as valid drop targets while a drag is in progress
// (faded accent ring); the cursor's current target lights up to full
// opacity with a background tint. Same ring width across states so the
// transition fades intensity instead of jumping thickness. ring-inset
// keeps the indicator inside the container so it can't overflow into
// siblings.
const HINT_AVAILABLE = "ring-2 ring-inset ring-[var(--accent-blue)]/40";
const HINT_OVER = "ring-2 ring-inset ring-[var(--accent-blue)] bg-[var(--accent-blue)]/10";

export interface UseActionsDropZoneResult {
  setNodeRef: (node: HTMLElement | null) => void;
  hintClass: string;
}

// Registers a group's container as a droppable and returns the Tailwind
// class describing how it should highlight during a drag. Hides the
// ZONE_ID synthetic-id convention from the consumer.
export function useActionsDropZone(group: ActionGroup): UseActionsDropZoneResult {
  const { setNodeRef, isOver, active } = useDroppable({ id: ZONE_ID[group] });
  const hintClass = isOver ? HINT_OVER : active ? HINT_AVAILABLE : "";
  return { setNodeRef, hintClass };
}
