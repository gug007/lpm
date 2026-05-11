// Pure layout helpers for the actions drag-and-drop feature. Kept apart
// from ActionsDnd.tsx so the React component stays focused on
// orchestration and these reorder operations are easy to read and test.

import type { ActionsLayout } from "../types";

export type ActionGroup = "header" | "footer";

// Single source of truth for the synthetic-zone id namespace. Real
// action names cannot collide because action names go through slugify
// and don't contain colons.
export const ZONE_ID_PREFIX = "actions-zone:";

// Synthetic droppable IDs let a drag onto the empty area of a group
// (e.g. footer with no actions) resolve to the group itself rather than
// to no target.
export const ZONE_ID: Record<ActionGroup, string> = {
  header: `${ZONE_ID_PREFIX}header`,
  footer: `${ZONE_ID_PREFIX}footer`,
};

/** True when an id refers to a synthetic group-zone droppable rather than an action. */
export function isZoneId(id: string): boolean {
  return id.startsWith(ZONE_ID_PREFIX);
}

/** Find which group an action id currently lives in, or null if absent from both. */
export function groupOf(layout: ActionsLayout, id: string): ActionGroup | null {
  if (layout.header.includes(id)) return "header";
  if (layout.footer.includes(id)) return "footer";
  return null;
}

export interface DropTarget {
  group: ActionGroup;
  index: number;
}

/** Resolve a dnd-kit `over` id into the target group and insertion index, or null if unknown. */
export function resolveTarget(overId: string, layout: ActionsLayout): DropTarget | null {
  if (overId === ZONE_ID.header) return { group: "header", index: layout.header.length };
  if (overId === ZONE_ID.footer) return { group: "footer", index: layout.footer.length };
  const headerIdx = layout.header.indexOf(overId);
  if (headerIdx >= 0) return { group: "header", index: headerIdx };
  const footerIdx = layout.footer.indexOf(overId);
  if (footerIdx >= 0) return { group: "footer", index: footerIdx };
  return null;
}

/** Apply a drag move by removing the dragged id from both groups and inserting at the clamped target. */
export function applyMove(
  layout: ActionsLayout,
  draggedId: string,
  target: DropTarget,
): ActionsLayout {
  const next: ActionsLayout = {
    header: layout.header.filter((id) => id !== draggedId),
    footer: layout.footer.filter((id) => id !== draggedId),
  };
  const max = next[target.group].length;
  const index = Math.max(0, Math.min(target.index, max));
  next[target.group].splice(index, 0, draggedId);
  return next;
}

/** Structural equality check for two action layouts (header and footer order both match). */
export function sameLayout(a: ActionsLayout, b: ActionsLayout): boolean {
  return arrayEq(a.header, b.header) && arrayEq(a.footer, b.footer);
}

export function arrayEq(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
