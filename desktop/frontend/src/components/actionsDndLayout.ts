// Pure layout helpers for the actions drag-and-drop feature. Kept apart
// from ActionsDnd.tsx so the React component stays focused on
// orchestration and these reorder operations are easy to read and test.

import type { ActionsLayout } from "../types";

export type ActionGroup = "header" | "footer";

// Synthetic droppable IDs let a drag onto the empty area of a group
// (e.g. footer with no actions) resolve to the group itself rather than
// to no target. Prefixed to avoid colliding with real action names.
export const ZONE_ID: Record<ActionGroup, string> = {
  header: "actions-zone:header",
  footer: "actions-zone:footer",
};

export interface DropTarget {
  group: ActionGroup;
  index: number;
}

export function resolveTarget(overId: string, layout: ActionsLayout): DropTarget | null {
  if (overId === ZONE_ID.header) return { group: "header", index: layout.header.length };
  if (overId === ZONE_ID.footer) return { group: "footer", index: layout.footer.length };
  const headerIdx = layout.header.indexOf(overId);
  if (headerIdx >= 0) return { group: "header", index: headerIdx };
  const footerIdx = layout.footer.indexOf(overId);
  if (footerIdx >= 0) return { group: "footer", index: footerIdx };
  return null;
}

export function applyMove(
  layout: ActionsLayout,
  draggedId: string,
  target: DropTarget,
): ActionsLayout {
  const next: ActionsLayout = {
    header: layout.header.filter((id) => id !== draggedId),
    footer: layout.footer.filter((id) => id !== draggedId),
  };
  next[target.group].splice(target.index, 0, draggedId);
  return next;
}

export function sameLayout(a: ActionsLayout, b: ActionsLayout): boolean {
  return arrayEq(a.header, b.header) && arrayEq(a.footer, b.footer);
}

function arrayEq(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
