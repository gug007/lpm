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

// Resolve an action for a run request (spawn task / remote run). Tries, in
// order: the exact composite id (`parent:child`); a unique leaf-key match for a
// bare name (CLI/remote callers pass `--run claude` for a nested action whose
// real id is `claude-max:claude`); a unique case-insensitive match on the full
// id or leaf key; and finally a unique case-insensitive match on the label (an
// agent passing the display label "Claude" for id `claude-max:claude`). We'd
// rather run it than silently drop the task. Returns null when nothing matches
// or a fallback is ambiguous across more than one action.
export function resolveRunnableAction(
  actions: ActionInfo[],
  id: string,
): ActionInfo | null {
  const direct = findActionByPath(actions, id);
  if (direct) return direct;
  if (!id.includes(":")) {
    const leafMatches: ActionInfo[] = [];
    forEachAction(actions, (a) => {
      if (leafKey(a.name) === id) leafMatches.push(a);
    });
    if (leafMatches.length === 1) return leafMatches[0];
  }
  const lower = id.toLowerCase();
  const idMatches: ActionInfo[] = [];
  forEachAction(actions, (a) => {
    if (a.name.toLowerCase() === lower || leafKey(a.name).toLowerCase() === lower)
      idMatches.push(a);
  });
  if (idMatches.length === 1) return idMatches[0];
  const labelMatches: ActionInfo[] = [];
  forEachAction(actions, (a) => {
    if (a.label.toLowerCase() === lower) labelMatches.push(a);
  });
  return labelMatches.length === 1 ? labelMatches[0] : null;
}

export function menuChildOrderFor(
  actions: ActionInfo[],
  parent: string,
): string[] {
  const menu = findActionByPath(actions, parent);
  return (menu?.children ?? []).map((c) => splitChild(c.name)?.child ?? c.name);
}
