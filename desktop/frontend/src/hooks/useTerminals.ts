import { useRef, useEffect, useCallback } from "react";
import { StopTerminal } from "../../bridge/commands";
import { collectTerminals } from "../paneTree";
import { IS_MIRROR_WINDOW, requestMirrorAction } from "../mirror";
import { type UseTerminalsResult } from "./terminals/types";
import { useTreeCore } from "./terminals/useTreeCore";
import { useCmdInject } from "./terminals/useCmdInject";
import { useSshReconnect } from "./terminals/useSshReconnect";
import { useSessionRestore } from "./terminals/useSessionRestore";
import { useTabCreation } from "./terminals/useTabCreation";
import { usePaneOps } from "./terminals/usePaneOps";
import { useTabClose } from "./terminals/useTabClose";
import { useRemoteTabControls } from "./terminals/useRemoteTabControls";
import { useMirrorOwner } from "./terminals/useMirrorOwner";

export { type TerminalStartOpts, type UseTerminalsResult } from "./terminals/types";

export function useTerminals(
  projectName: string,
  onTerminalCountChange?: (count: number) => void,
  submitPrompt?: (id: string, payload: string | string[]) => boolean,
): UseTerminalsResult {
  const onCountRef = useRef(onTerminalCountChange);
  onCountRef.current = onTerminalCountChange;
  const submitPromptRef = useRef(submitPrompt);
  submitPromptRef.current = submitPrompt;

  // Settles when the mount restore is done (tree applied, or nothing to
  // restore). Terminal creation awaits this: a create that races the restore —
  // e.g. a mobile "new terminal" request that just mounted this project — would
  // otherwise land first and be wiped by the restore's setTree.
  const restoreSettled = useRef<Promise<void>>(Promise.resolve());

  const {
    tree,
    focusedPaneId,
    setTree,
    setFocusedPaneId,
    treeRef,
    focusedRef,
    applyTree,
    schedulePersist,
    flushDeferredPersist,
  } = useTreeCore({ projectName, onCountRef });

  const { scheduleCmdInject, scheduleSeedInject, cancelPendingInjects } = useCmdInject({
    submitPromptRef,
  });

  const { cancelAllReconnects } = useSshReconnect({
    projectName,
    tree,
    treeRef,
    applyTree,
    scheduleCmdInject,
  });

  useSessionRestore({
    projectName,
    treeRef,
    focusedRef,
    onCountRef,
    restoreSettled,
    setTree,
    setFocusedPaneId,
    applyTree,
    scheduleCmdInject,
  });

  // Mirror -> owner action forwarding: the mirror can't spawn/stop PTYs or
  // restructure the tree (its tree is overwritten by every owner broadcast), so
  // it sends the action by name and the owner executes it; the result comes
  // back through the tree broadcast. Pure tree actions (focus, rename, reorder)
  // ALSO apply locally so they feel instant — the owner applies the same change
  // and the echoed broadcast is a no-op.
  const forward = useCallback(
    (kind: string, ...args: unknown[]) => {
      requestMirrorAction(projectName, kind, args);
    },
    [projectName],
  );

  const {
    createTerminal,
    adoptTerminal,
    createTerminalWithCmd,
    resumeFromHistory,
    forkTerminal,
    forkTerminalIntoCopy,
    addTerminalToPane,
    addBrowserToPane,
    addReviewToPane,
  } = useTabCreation({
    projectName,
    treeRef,
    focusedRef,
    restoreSettled,
    applyTree,
    forward,
    scheduleCmdInject,
    scheduleSeedInject,
  });

  const {
    focusTerminal,
    focusService,
    focusAdjacentPaneItem,
    ensureRootPane,
    renameTerminal,
    toggleTabPinned,
    reorderTerminals,
    moveTerminal,
    splitPane,
    setRatio,
    focusPane,
    getFocusedPane,
    getPane,
    clearRatioForwardTimer,
  } = usePaneOps({
    projectName,
    treeRef,
    focusedRef,
    setTree,
    setFocusedPaneId,
    applyTree,
    schedulePersist,
    forward,
  });

  const {
    closeTerminal,
    closeOtherTerminals,
    closePane,
    closeTerminalById,
    closeOthersById,
    finalizePendingClosesForProject,
  } = useTabClose({
    projectName,
    treeRef,
    focusedRef,
    applyTree,
    forward,
    getPane,
  });

  const {
    remoteCloseTerminal,
    removeAdoptedTerminal,
    remoteRenameTerminal,
    remoteTogglePin,
    remoteReorderTerminals,
  } = useRemoteTabControls({
    treeRef,
    closeTerminal,
    renameTerminal,
    toggleTabPinned,
    reorderTerminals,
  });

  // Owner side of action forwarding: execute the actions a mirror window sends
  // for this project against the authoritative tree. This map is the single
  // list of everything a mirror may do; the result flows back to the mirror
  // through the tree broadcast. Pane/tab ids in the args are valid here because
  // the mirror's tree is a verbatim copy of this window's.
  const forwardable = {
    createTerminal,
    createTerminalWithCmd,
    resumeFromHistory,
    forkTerminal,
    forkTerminalIntoCopy,
    addTerminalToPane,
    addBrowserToPane,
    addReviewToPane,
    closeTerminalById,
    closeOthersById,
    focusTerminal,
    focusService,
    renameTerminal,
    toggleTabPinned,
    reorderTerminals,
    moveTerminal,
    splitPane,
    closePane,
    setRatio,
    focusPane,
    ensureRootPane,
  };

  useMirrorOwner({
    projectName,
    tree,
    focusedPaneId,
    treeRef,
    focusedRef,
    forwardable,
  });

  // Cleanup all terminals and pending command injections on unmount.
  // Flush any debounced persist first so in-flight ratio changes aren't
  // lost.
  useEffect(() => {
    return () => {
      flushDeferredPersist();
      clearRatioForwardTimer();
      cancelPendingInjects();
      cancelAllReconnects();
      // A mirror window adopts the owner's PTYs; closing it must not stop them.
      if (IS_MIRROR_WINDOW) return;
      // Pending-close tabs aren't in the tree, so the loop below won't stop
      // their PTYs — finalize each now so nothing orphans on unmount/quit.
      finalizePendingClosesForProject();
      const current = treeRef.current;
      if (current) {
        collectTerminals(current).forEach((t) => {
          StopTerminal(t.id).catch(() => {});
        });
      }
    };
  }, [
    flushDeferredPersist,
    clearRatioForwardTimer,
    cancelPendingInjects,
    cancelAllReconnects,
    finalizePendingClosesForProject,
  ]);

  return {
    tree,
    focusedPaneId,
    createTerminal,
    createTerminalWithCmd,
    adoptTerminal,
    resumeFromHistory,
    forkTerminal,
    forkTerminalIntoCopy,
    addTerminalToPane,
    addBrowserToPane,
    addReviewToPane,
    closeTerminal,
    closeOtherTerminals,
    focusTerminal,
    focusAdjacentPaneItem,
    focusService,
    renameTerminal,
    toggleTabPinned,
    reorderTerminals,
    remoteCloseTerminal,
    removeAdoptedTerminal,
    remoteRenameTerminal,
    remoteTogglePin,
    remoteReorderTerminals,
    moveTerminal,
    splitPane,
    closePane,
    setRatio,
    focusPane,
    ensureRootPane,
    getFocusedPane,
    getPane,
  };
}
