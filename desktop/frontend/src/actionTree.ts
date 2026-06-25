import type { ActionInfo } from "./types";
import { splitChild } from "./actionIds";

export function findActionByPath(actions: ActionInfo[], id: string): ActionInfo | null {
  const segs = id.split(":");
  let level = actions;
  let found: ActionInfo | null = null;
  for (let i = 0; i < segs.length; i++) {
    const wantName = segs.slice(0, i + 1).join(":");
    const node = level.find((a) => a.name === wantName) ?? null;
    if (!node) return null;
    found = node;
    level = node.children ?? [];
  }
  return found;
}

export function menuChildOrderFor(actions: ActionInfo[], parent: string): string[] {
  const menu = findActionByPath(actions, parent);
  return (menu?.children ?? []).map((c) => splitChild(c.name)?.child ?? c.name);
}
