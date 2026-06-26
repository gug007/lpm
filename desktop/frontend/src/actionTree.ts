import type { ActionInfo } from "./types";
import { splitChild } from "./actionIds";

// An action that can run unattended on a fresh copy: it has its own command and
// never pauses for per-run input or a confirmation. Split-button parents qualify
// (their command is the default action); pure menus, which only group children,
// do not.
export function isRunnableAction(a: ActionInfo): boolean {
  return !!a.cmd && !a.inputs?.length && !a.confirm;
}

// True if any descendant (at any depth) is runnable — so a menu/split worth
// drilling into is offered even when it isn't runnable itself.
export function hasRunnableDescendant(a: ActionInfo): boolean {
  return (a.children ?? []).some(
    (c) => isRunnableAction(c) || hasRunnableDescendant(c),
  );
}

// Every runnable action in the tree, depth-first (parents before their
// children), for "is anything runnable?" checks and default seeding.
export function flattenRunnableActions(actions: ActionInfo[]): ActionInfo[] {
  const out: ActionInfo[] = [];
  const walk = (list: ActionInfo[]) => {
    for (const a of list) {
      if (isRunnableAction(a)) out.push(a);
      if (a.children?.length) walk(a.children);
    }
  };
  walk(actions);
  return out;
}

export function findActionByPath(
  actions: ActionInfo[],
  id: string,
): ActionInfo | null {
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

export function menuChildOrderFor(
  actions: ActionInfo[],
  parent: string,
): string[] {
  const menu = findActionByPath(actions, parent);
  return (menu?.children ?? []).map((c) => splitChild(c.name)?.child ?? c.name);
}
