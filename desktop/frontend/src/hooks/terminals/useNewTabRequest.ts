import { useCallback, useRef, useState } from "react";
import { findPane, firstPaneId, type PaneNode } from "../../paneTree";
import { useSettingsStore } from "../../store/settings";

interface UseNewTabRequestProps {
  tree: PaneNode | null;
  focusedPaneId: string | null;
  // Drawn, and on screen but behind an empty-state placeholder — see TerminalView.
  visible: boolean;
  onScreen: boolean;
  createTerminal: () => Promise<void>;
}

// ⌘T: a terminal, or with "Pick agent and model on +" on, the + popup of the
// focused pane; `asLauncher` asks for the popup either way. With no pane to
// hang it on, the view's own empty state shows it when that is on screen;
// otherwise openNewTab answers false and the caller's empty state does.
export function useNewTabRequest({
  tree,
  focusedPaneId,
  visible,
  onScreen,
  createTerminal,
}: UseNewTabRequestProps) {
  const [paneId, setPaneId] = useState<string | null>(null);
  const [emptyAsked, setEmptyAsked] = useState(false);
  const latest = useRef({ tree, focusedPaneId, visible, onScreen });
  latest.current = { tree, focusedPaneId, visible, onScreen };

  const openNewTab = useCallback((asLauncher = false): boolean => {
    if (!asLauncher && !useSettingsStore.getState().pickAgentOnNewTab) {
      void createTerminal();
      return true;
    }
    const now = latest.current;
    const behindPlaceholder = now.onScreen && !now.visible;
    if (now.tree && !behindPlaceholder) {
      const focused = now.focusedPaneId && findPane(now.tree, now.focusedPaneId);
      setPaneId(focused ? focused.id : firstPaneId(now.tree));
      return true;
    }
    if (now.visible) {
      setEmptyAsked(true);
      return true;
    }
    return false;
  }, [createTerminal]);

  const clearPaneRequest = useCallback(() => setPaneId(null), []);
  const clearEmptyRequest = useCallback(() => setEmptyAsked(false), []);

  return { newTabPaneId: paneId, clearPaneRequest, emptyAsked, clearEmptyRequest, openNewTab };
}
