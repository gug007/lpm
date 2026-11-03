import { useCallback, type RefObject } from "react";
import { collectPanes, type PaneNode, type TerminalInstance } from "../../paneTree";

// Focus the project's tab of `kind` wherever it lives in the layout, or add
// one to the focused pane. Waits for the mount restore first: a tab added to a
// project that just mounted would be replaced by the restored layout.
export function useOpenUtilityTab(
  treeRef: RefObject<PaneNode | null>,
  restoreSettled: RefObject<Promise<void>>,
  focusTerminal: (paneId: string, tabIdx: number) => void,
) {
  return useCallback(
    async (kind: NonNullable<TerminalInstance["kind"]>, add: (paneId?: string) => void) => {
      await restoreSettled.current;
      for (const pane of treeRef.current ? collectPanes(treeRef.current) : []) {
        const tabIdx = pane.tabs.findIndex((t) => t.kind === kind);
        if (tabIdx >= 0) return focusTerminal(pane.id, tabIdx);
      }
      add();
    },
    [treeRef, restoreSettled, focusTerminal],
  );
}
