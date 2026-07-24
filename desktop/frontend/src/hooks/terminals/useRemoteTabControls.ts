import { useCallback, type RefObject } from "react";
import { type PaneNode, collectPanes } from "../../paneTree";
import { IS_MIRROR_WINDOW } from "../../mirror";

interface UseRemoteTabControlsProps {
  treeRef: RefObject<PaneNode | null>;
  closeTerminal: (
    paneId: string,
    tabIdx: number,
    opts?: { stop?: boolean; force?: boolean },
  ) => void;
  renameTerminal: (paneId: string, tabIdx: number, label: string, emoji?: string) => void;
  toggleTabPinned: (paneId: string, tabIdx: number) => void;
  reorderTerminals: (paneId: string, order: string[]) => void;
}

export function useRemoteTabControls({
  treeRef,
  closeTerminal,
  renameTerminal,
  toggleTabPinned,
  reorderTerminals,
}: UseRemoteTabControlsProps) {
  // Pane-agnostic id resolvers for callers (the mobile relay) that only know a
  // terminal's id, not which pane holds it: walk the tree to locate the tab,
  // then run the normal index-based handler. A missing id is a safe no-op.
  const locateTerminal = useCallback((termId: string) => {
    const current = treeRef.current;
    if (!current) return null;
    for (const pane of collectPanes(current)) {
      const idx = pane.tabs.findIndex((t) => t.id === termId);
      if (idx >= 0) return { paneId: pane.id, idx };
    }
    return null;
  }, []);
  const remoteCloseTerminal = useCallback(
    (termId: string) => {
      const hit = locateTerminal(termId);
      if (hit) closeTerminal(hit.paneId, hit.idx);
    },
    [locateTerminal, closeTerminal],
  );
  // Mirror of adoptTerminal: a peer Mac closed this terminal, so drop its tab
  // from the live tree. The backend pty is already gone — remove without a
  // second stop_terminal, disposing the xterm session via the same close path
  // (unmount) a normal close uses. Unknown id is a safe no-op.
  const removeAdoptedTerminal = useCallback(
    (termId: string) => {
      if (IS_MIRROR_WINDOW) return;
      const hit = locateTerminal(termId);
      if (hit) closeTerminal(hit.paneId, hit.idx, { stop: false, force: true });
    },
    [locateTerminal, closeTerminal],
  );
  const remoteRenameTerminal = useCallback(
    (termId: string, label: string) => {
      const hit = locateTerminal(termId);
      if (hit && label.trim()) renameTerminal(hit.paneId, hit.idx, label.trim());
    },
    [locateTerminal, renameTerminal],
  );
  const remoteTogglePin = useCallback(
    (termId: string) => {
      const hit = locateTerminal(termId);
      if (hit) toggleTabPinned(hit.paneId, hit.idx);
    },
    [locateTerminal, toggleTabPinned],
  );
  // The phone shows a flat list across all panes and sends the full new id order.
  // Reorder each pane by its terminals' relative order in that list (a terminal
  // stays in its own pane; cross-pane moves aren't expressed by a flat reorder).
  const remoteReorderTerminals = useCallback(
    (order: string[]) => {
      const current = treeRef.current;
      if (!current) return;
      for (const pane of collectPanes(current)) {
        const paneIds = new Set(pane.tabs.map((t) => t.id));
        const paneOrder = order.filter((id) => paneIds.has(id));
        if (paneOrder.length === pane.tabs.length && paneOrder.length > 0) {
          reorderTerminals(pane.id, paneOrder);
        }
      }
    },
    [reorderTerminals],
  );

  return {
    remoteCloseTerminal,
    removeAdoptedTerminal,
    remoteRenameTerminal,
    remoteTogglePin,
    remoteReorderTerminals,
  };
}
