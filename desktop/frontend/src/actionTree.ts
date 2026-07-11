import type { ActionInfo } from "./types";
import { splitChild, leafKey } from "./actionIds";

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

// Visit every action in the tree depth-first (parents before their children).
export function forEachAction(
  actions: ActionInfo[],
  visit: (action: ActionInfo) => void,
): void {
  for (const action of actions) {
    visit(action);
    if (action.children?.length) forEachAction(action.children, visit);
  }
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

// Resolve an action for a run request (spawn task / remote run). First tries the
// exact composite id (`parent:child`). If that misses and the id carries no
// separator, falls back to a unique leaf-key match anywhere in the tree — CLI
// and remote callers routinely pass the bare leaf name (`--run claude`) for a
// nested action whose real id is `claude-max:claude`, and we'd rather run it than
// silently drop the task. Returns null when nothing matches, or when a bare name
// is ambiguous across more than one leaf.
export function resolveRunnableAction(
  actions: ActionInfo[],
  id: string,
): ActionInfo | null {
  const direct = findActionByPath(actions, id);
  if (direct) return direct;
  if (id.includes(":")) return null;
  const matches: ActionInfo[] = [];
  forEachAction(actions, (a) => {
    if (leafKey(a.name) === id) matches.push(a);
  });
  return matches.length === 1 ? matches[0] : null;
}

export function menuChildOrderFor(
  actions: ActionInfo[],
  parent: string,
): string[] {
  const menu = findActionByPath(actions, parent);
  return (menu?.children ?? []).map((c) => splitChild(c.name)?.child ?? c.name);
}
