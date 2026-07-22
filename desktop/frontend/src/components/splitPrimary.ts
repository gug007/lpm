import type { ActionInfo } from "../types";

export const PRIMARY_LAST_USED = "last-used";

export function childKey(child: ActionInfo): string {
  const name = child.name;
  const idx = name.lastIndexOf(":");
  return idx === -1 ? name : name.slice(idx + 1);
}

export function eligibleChildren(action: ActionInfo): ActionInfo[] {
  const children = action.children ?? [];
  return children.filter((c) => !!c.cmd || !(c.children?.length));
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
