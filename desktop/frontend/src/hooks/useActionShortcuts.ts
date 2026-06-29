import { useMemo } from "react";
import type { ActionInfo } from "../types";
import { forEachAction } from "../actionTree";
import { useKeyboardShortcut, type KeyboardShortcut } from "./useKeyboardShortcut";
import { canonicalShortcut, parseShortcut } from "../shortcutParse";

// Bind every command-bearing action (top-level or nested child) that carries a
// valid shortcut string to a global key combo that runs it. Pure menus and
// dropdowns (no command) are skipped, and the first action wins when two share
// a combo. `enabled` is the active-project gate so a hidden project's shortcuts
// never fire.
export function useActionShortcuts(
  actions: ActionInfo[] | undefined,
  run: (action: ActionInfo) => void,
  enabled: boolean,
) {
  const { shortcuts, byCanonical } = useMemo(() => {
    const shortcuts: KeyboardShortcut[] = [];
    const byCanonical = new Map<string, ActionInfo>();
    forEachAction(actions ?? [], (action) => {
      if (!action.cmd || !action.shortcut) return;
      const parsed = parseShortcut(action.shortcut);
      if (!parsed) return;
      const id = canonicalShortcut(parsed);
      if (byCanonical.has(id)) return;
      byCanonical.set(id, action);
      shortcuts.push(parsed);
    });
    return { shortcuts, byCanonical };
  }, [actions]);

  useKeyboardShortcut(
    shortcuts,
    (_event, matched) => {
      const action = byCanonical.get(canonicalShortcut(matched));
      if (action) run(action);
    },
    enabled && shortcuts.length > 0,
  );
}
