import type { ActionInfo } from "../types";
import { runsOnClick } from "../popup/appTab";

export const PRIMARY_LAST_USED = "last-used";

export function childKey(child: ActionInfo): string {
  const name = child.name;
  const idx = name.lastIndexOf(":");
  return idx === -1 ? name : name.slice(idx + 1);
}

export function eligibleChildren(action: ActionInfo): ActionInfo[] {
  const children = action.children ?? [];
  return children.filter((c) => runsOnClick(c) || !(c.children?.length));
}

export function resolvePrimaryChild(
  action: ActionInfo,
  remembered: string | null,
): ActionInfo | null {
  if (!action.primary) return null;
  const children = action.children ?? [];
  const target = action.primary === PRIMARY_LAST_USED ? remembered : action.primary;
  if (target) {
    const match = children.find((c) => childKey(c) === target);
    if (match) return match;
  }
  return eligibleChildren(action)[0] ?? null;
}

// A split button is one when it has an item to run or a command of its own;
// otherwise it is a menu that only opens.
export function isSplitButton(action: ActionInfo, primaryChild: ActionInfo | null): boolean {
  return !!primaryChild || runsOnClick(action);
}

// A "last used" split button remembers a direct item run from its menu; the
// key it now leads with, or null when it keeps what it had.
export function noteChildRun(scope: string, action: ActionInfo, child: ActionInfo): string | null {
  if (action.primary !== PRIMARY_LAST_USED) return null;
  if (!child.name.startsWith(`${action.name}:`)) return null;
  const rest = child.name.slice(action.name.length + 1);
  if (rest.includes(":")) return null;
  rememberChild(scope, action.name, rest);
  return rest;
}

// Items without a color of their own launch with the group's accent, so a tab
// spawned from a colored split button keeps the tint the button shows.
export function inGroupColor(action: ActionInfo, child: ActionInfo): ActionInfo {
  return child.color || !action.color ? child : { ...child, color: action.color };
}

export function primaryStorageKey(scope: string, actionName: string): string {
  return `lpm.action-primary.${scope}.${actionName}`;
}

export function loadRememberedChild(scope: string, actionName: string): string | null {
  try {
    return localStorage.getItem(primaryStorageKey(scope, actionName));
  } catch {
    return null;
  }
}

export function rememberChild(scope: string, actionName: string, key: string): void {
  try {
    localStorage.setItem(primaryStorageKey(scope, actionName), key);
  } catch {
    // ignore storage failures (private mode, quota)
  }
}
