import { useDroppable } from "@dnd-kit/core";
import { ZONE_ID, type ActionGroup } from "../components/actionsDndLayout";

// Both groups read as valid drop targets while a drag is in progress.
// Available zones get a subtle dashed inner outline + faint bg tint so
// they whisper rather than shout. The cursor's current target gets a
// solid inner ring + brighter bg tint to clearly indicate the drop
// landing. Inner outline/ring keep the indicator inside the container
// so it can't overflow into siblings; transition smooths the swap
// between states.
const HINT_BASE = "transition-all duration-150";
const HINT_AVAILABLE =
  "outline outline-1 outline-dashed outline-[var(--accent-blue)]/30 bg-[var(--accent-blue)]/[0.03]";
const HINT_OVER = "ring-2 ring-inset ring-[var(--accent-blue)] bg-[var(--accent-blue)]/10";

export interface UseActionsDropZoneResult {
  setNodeRef: (node: HTMLElement | null) => void;
  hintClass: string;
  isOver: boolean;
  active: boolean;
}

export function useActionsDropZone(group: ActionGroup): UseActionsDropZoneResult {
  const { setNodeRef, isOver, active } = useDroppable({ id: ZONE_ID[group] });
  const stateClass = isOver ? HINT_OVER : active ? HINT_AVAILABLE : "";
  const hintClass = stateClass ? `${HINT_BASE} ${stateClass}` : HINT_BASE;
  return { setNodeRef, hintClass, isOver, active: active != null };
}
