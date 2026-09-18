"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_PANE_TOOLBAR,
  isDefaultPaneToolbar,
  paneMenuActions,
  withPaneToolbar,
  type PaneActionId,
} from "./pane-actions";

// The split of pane actions between the header's toolbar and its menu. The app
// keeps it in settings, shared by every pane; here it lives outside React for
// the same reason — switching projects remounts the view, and a header that
// rearranged itself on the way back would read as a bug.
let onToolbar: readonly PaneActionId[] = DEFAULT_PANE_TOOLBAR;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function set(next: readonly PaneActionId[]) {
  onToolbar = next;
  for (const listener of listeners) listener();
}

export function usePaneToolbar() {
  const current = useSyncExternalStore(
    subscribe,
    () => onToolbar,
    () => DEFAULT_PANE_TOOLBAR,
  );
  const move = useCallback((id: PaneActionId, toToolbar: boolean) => {
    set(withPaneToolbar(onToolbar, id, toToolbar));
  }, []);
  const reset = useCallback(() => set(DEFAULT_PANE_TOOLBAR), []);
  return {
    toolbar: [...current],
    menu: paneMenuActions(current),
    isDefault: isDefaultPaneToolbar(current),
    move,
    reset,
  };
}
