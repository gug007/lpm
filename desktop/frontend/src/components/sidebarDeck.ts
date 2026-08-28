import type { ProjectInfo } from "../types";

/** Shared with the `deck-deal` keyframes in globals.css. */
export const DEAL_DURATION_MS = 150;
export const DEAL_STEP_MS = 30;

export function dealDurationMs(count: number): number {
  return DEAL_DURATION_MS + Math.max(0, count - 1) * DEAL_STEP_MS;
}

const UNTAME_DOM_ID = /[^a-zA-Z0-9_-]/g;

export function deckRunDomId(parentName: string): string {
  return `sidebar-deck-${parentName.replace(UNTAME_DOM_ID, "_")}`;
}

/** Names only the kind the parent actually owns; the count sits next to it. */
export function deckKindLabel(children: ProjectInfo[]): string {
  let worktrees = 0;
  for (const child of children) if (child.worktree) worktrees++;
  const duplicates = children.length - worktrees;
  if (worktrees === 0) return duplicates === 1 ? "duplicate" : "duplicates";
  if (duplicates === 0) return worktrees === 1 ? "worktree" : "worktrees";
  return "duplicates & worktrees";
}

export function deckLabel(
  children: ProjectInfo[],
  parentLabel: string,
  collapsed: boolean,
): string {
  return `${collapsed ? "Show" : "Hide"} ${children.length} ${deckKindLabel(children)} of ${parentLabel}`;
}
