import { useCallback, type RefObject } from "react";
import { type PaneNode, collectPanes, otherTerminals } from "../../paneTree";
import { IS_MIRROR_WINDOW } from "../../mirror";
import { paneOrderFollowing } from "./remoteTabOrder";

interface UseRemoteTabControlsProps {
  treeRef: RefObject<PaneNode | null>;
  restoreSettled: RefObject<Promise<void>>;
  closeTerminal: (
    paneId: string,
    tabIdx: number,
    opts?: { stop?: boolean; force?: boolean },
  ) => void;
  closeTabWhenDone: (termId: string) => void;
  closeOthersEverywhereWhenDone: (termId: string) => Promise<void>;
  keepOpen: (termId: string) => void;
  renameTerminal: (paneId: string, tabIdx: number, label: string, emoji?: string) => void;
  restoreSessionTitle: (paneId: string, tabIdx: number) => void;
  toggleTabPinned: (paneId: string, tabIdx: number) => void;
  reorderTerminals: (paneId: string, order: string[]) => void;
  closeTerminalsById: (ids: string[]) => void;
  forkTerminal: (paneId: string, termId: string) => Promise<void>;
  forkTerminalIntoCopy: (paneId: string, termId: string) => Promise<void>;
}

export function useRemoteTabControls({
  treeRef,
  restoreSettled,
  closeTerminal,
  closeTabWhenDone,
  closeOthersEverywhereWhenDone,
  keepOpen,
  renameTerminal,
  restoreSessionTitle,
  toggleTabPinned,
  reorderTerminals,
  closeTerminalsById,
  forkTerminal,
  forkTerminalIntoCopy,
}: UseRemoteTabControlsProps) {
  // Pane-agnostic id resolvers for callers (a phone, another Mac) that only know
  // a terminal's id, not which pane holds it: walk the tree to locate the tab,
  // then run the normal index-based handler. A missing id is a safe no-op. A
  // project mounted for the request is still restoring, so each waits for that.
  const locateTerminal = useCallback(async (termId: string) => {
    await restoreSettled.current;
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
      void locateTerminal(termId).then((hit) => hit && closeTerminal(hit.paneId, hit.idx));
    },
    [locateTerminal, closeTerminal],
  );
  const remoteCloseWhenDone = useCallback(
    (termId: string) => void restoreSettled.current.then(() => closeTabWhenDone(termId)),
    [closeTabWhenDone],
  );
  const remoteCloseOthersWhenDone = useCallback(
    (termId: string) => void restoreSettled.current.then(() => closeOthersEverywhereWhenDone(termId)),
    [closeOthersEverywhereWhenDone],
  );
  const remoteKeepOpen = useCallback(
    (termId: string) => void restoreSettled.current.then(() => keepOpen(termId)),
    [keepOpen],
  );
  // Mirror of adoptTerminal: a peer Mac closed this terminal, so drop its tab
  // from the live tree. The backend pty is already gone — remove without a
  // second stop_terminal, disposing the xterm session via the same close path
  // (unmount) a normal close uses. Unknown id is a safe no-op.
  const removeAdoptedTerminal = useCallback(
    (termId: string) => {
      if (IS_MIRROR_WINDOW) return;
      void locateTerminal(termId).then(
        (hit) => hit && closeTerminal(hit.paneId, hit.idx, { stop: false, force: true }),
      );
    },
    [locateTerminal, closeTerminal],
  );
  // `emoji` undefined leaves the icon alone; "" clears it.
  const remoteRenameTerminal = useCallback(
    (termId: string, label: string, emoji?: string) => {
      if (!label.trim()) return;
      void locateTerminal(termId).then(
        (hit) => hit && renameTerminal(hit.paneId, hit.idx, label.trim(), emoji),
      );
    },
    [locateTerminal, renameTerminal],
  );
  const remoteRestoreTitle = useCallback(
    (termId: string) => {
      void locateTerminal(termId).then((hit) => hit && restoreSessionTitle(hit.paneId, hit.idx));
    },
    [locateTerminal, restoreSessionTitle],
  );
  const remoteTogglePin = useCallback(
    (termId: string) => {
      void locateTerminal(termId).then((hit) => hit && toggleTabPinned(hit.paneId, hit.idx));
    },
    [locateTerminal, toggleTabPinned],
  );
  // A phone or another Mac sends one flat id order across every pane. Each pane
  // takes its terminals' relative order from it; a tab the list leaves out (a
  // browser tab, a finished terminal) keeps its place, and a terminal stays in
  // its own pane.
  const remoteReorderTerminals = useCallback(
    (order: string[]) => {
      void restoreSettled.current.then(() => {
        const current = treeRef.current;
        if (!current) return;
        for (const pane of collectPanes(current)) {
          const paneOrder = paneOrderFollowing(pane.tabs.map((t) => t.id), order);
          if (paneOrder) reorderTerminals(pane.id, paneOrder);
        }
      });
    },
    [reorderTerminals],
  );

  const remoteForkTerminal = useCallback(
    (termId: string) => {
      void locateTerminal(termId).then((hit) => hit && forkTerminal(hit.paneId, termId));
    },
    [locateTerminal, forkTerminal],
  );
  // The phone asked before sending this, the way the desktop's own menu does.
  const remoteForkIntoCopy = useCallback(
    (termId: string) => {
      void locateTerminal(termId).then((hit) => hit && forkTerminalIntoCopy(hit.paneId, termId));
    },
    [locateTerminal, forkTerminalIntoCopy],
  );
  const remoteCloseOthers = useCallback(
    (termId: string) => {
      void restoreSettled.current.then(() => {
        const current = treeRef.current;
        const ids = current ? otherTerminals(current, termId).map((t) => t.id) : [];
        if (ids.length > 0) closeTerminalsById(ids);
      });
    },
    [closeTerminalsById],
  );

  return {
    remoteCloseTerminal,
    remoteForkTerminal,
    remoteForkIntoCopy,
    remoteCloseOthers,
    remoteCloseWhenDone,
    remoteCloseOthersWhenDone,
    remoteKeepOpen,
    removeAdoptedTerminal,
    remoteRenameTerminal,
    remoteRestoreTitle,
    remoteTogglePin,
    remoteReorderTerminals,
  };
}
