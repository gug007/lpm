import { useCallback, type RefObject } from "react";
import { collectPanes, type AppTabSeed, type PaneNode } from "../../paneTree";

// Show an action's app: focus the tab already on it, wherever it is in the
// layout, or open one in `paneId` (the focused pane when that one is gone).
// Waits for the mount restore first, like the Browser tab.
export function useOpenAppTab(
  treeRef: RefObject<PaneNode | null>,
  restoreSettled: RefObject<Promise<void>>,
  focusTerminal: (paneId: string, tabIdx: number) => void,
  addAppToPane: (seed: AppTabSeed, paneId?: string) => void,
) {
  return useCallback(
    async (seed: AppTabSeed, paneId?: string) => {
      await restoreSettled.current;
      const panes = treeRef.current ? collectPanes(treeRef.current) : [];
      for (const pane of panes) {
        const tabIdx = pane.tabs.findIndex((t) => t.kind === "app" && t.actionName === seed.actionName);
        if (tabIdx >= 0) return focusTerminal(pane.id, tabIdx);
      }
      addAppToPane(seed, panes.some((p) => p.id === paneId) ? paneId : undefined);
    },
    [treeRef, restoreSettled, focusTerminal, addAppToPane],
  );
}
