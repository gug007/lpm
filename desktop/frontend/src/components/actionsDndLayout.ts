import type { ActionsLayout } from "../types";

export type ActionGroup = "header" | "footer";

// Where a menu item being dragged out would land if dropped: the row and
// the gap index between top-level buttons. Drives the insertion placeholder.
export interface ExtractIndicator {
  group: ActionGroup;
  index: number;
}

// Prefixed so it can't collide with action names (slugify excludes colons).
export const ZONE_ID_PREFIX = "actions-zone:";

// Drops onto a group's empty area need a target; without these synthetic
// ids the drop would resolve to no target and the move would no-op.
export const ZONE_ID: Record<ActionGroup, string> = {
  header: `${ZONE_ID_PREFIX}header`,
  footer: `${ZONE_ID_PREFIX}footer`,
};

export function isZoneId(id: string): boolean {
  return id.startsWith(ZONE_ID_PREFIX);
}

export const NEST_ID_PREFIX = "nest:";
export function nestId(name: string): string {
  return `${NEST_ID_PREFIX}${name}`;
}
export function isNestId(id: string): boolean {
  return id.startsWith(NEST_ID_PREFIX);
}
export function nestTargetOf(id: string): string {
  return id.slice(NEST_ID_PREFIX.length);
}

export function groupOf(layout: ActionsLayout, id: string): ActionGroup | null {
  if (layout.header.includes(id)) return "header";
  if (layout.footer.includes(id)) return "footer";
  return null;
}

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
  const max = next[target.group].length;
  const index = Math.max(0, Math.min(target.index, max));
  next[target.group].splice(index, 0, draggedId);
  return next;
}

export function sameLayout(a: ActionsLayout, b: ActionsLayout): boolean {
  return arrayEq(a.header, b.header) && arrayEq(a.footer, b.footer);
}

export function arrayEq(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
