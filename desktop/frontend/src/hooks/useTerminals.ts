import { useRef, useEffect, useCallback } from "react";
import { StopTerminal } from "../../bridge/commands";
import { collectTerminals } from "../paneTree";
import { captureLayout as captureTreeLayout } from "../savedLayouts";
import { IS_MIRROR_WINDOW, requestMirrorAction } from "../mirror";
import { isPeerName } from "../peer/markers";
import { type UseTerminalsResult } from "./terminals/types";
import { useTreeCore } from "./terminals/useTreeCore";
import { useCmdInject } from "./terminals/useCmdInject";
import { useSshReconnect } from "./terminals/useSshReconnect";
import { useTerminalRestart } from "./terminals/useTerminalRestart";
import { useClaudeAccountSwitch } from "./terminals/useClaudeAccountSwitch";
import { useSessionRestore } from "./terminals/useSessionRestore";
import { usePeerTerminalSync } from "./terminals/usePeerTerminalSync";
import { useTabCreation } from "./terminals/useTabCreation";
import { usePaneOps } from "./terminals/usePaneOps";
import { useTabClose } from "./terminals/useTabClose";
import { useRemoteTabControls } from "./terminals/useRemoteTabControls";
import { useMirrorOwner } from "./terminals/useMirrorOwner";
import { useAgentSessionTitles } from "./terminals/useAgentSessionTitles";
import { useAgentSessionEvents } from "./terminals/useAgentSessionEvents";
import { useTerminalMemory } from "./terminals/useTerminalMemory";
import { useOpenUtilityTab } from "./terminals/useOpenUtilityTab";
import { useOpenBrowserTab } from "./terminals/useOpenBrowserTab";
import { useApplyLayout } from "./terminals/useApplyLayout";
import { useDefaultLayout } from "./terminals/useDefaultLayout";

export { type TerminalStartOpts, type UseTerminalsResult } from "./terminals/types";

export function useTerminals(
  projectName: string,
  onTerminalCountChange?: (count: number) => void,
  submitPrompt?: (id: string, payload: string | string[]) => boolean,
  agentSessionTitlesEnabled = true,
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
    persist,
    schedulePersist,
    flushDeferredPersist,
    holdPersistedPanes,
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
  const restartTerminal = useTerminalRestart({ projectName, treeRef, applyTree, scheduleCmdInject });

  useSessionRestore({
    projectName,
    treeRef,
    focusedRef,
    onCountRef,
    restoreSettled,
    setTree,
    setFocusedPaneId,
    applyTree,
    persist,
    holdPersistedPanes,
    scheduleCmdInject,
  });

  usePeerTerminalSync({
    projectName,
    treeRef,
    focusedRef,
    restoreSettled,
    applyTree,
  });

  useAgentSessionEvents({
    projectName,
    treeRef,
    applyTree,
  });

  useAgentSessionTitles({
    projectName,
    tree,
    treeRef,
    applyTree,
    enabled: agentSessionTitlesEnabled,
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

  const switchClaudeAccount = useClaudeAccountSwitch({
    projectName,
    treeRef,
    applyTree,
    scheduleCmdInject,
    forward,
    restartTerminal,
  });

  const { noteTerminalMemory, detachTerminalMemory } = useTerminalMemory({
    projectName,
    tree,
    treeRef,
    applyTree,
    forward,
  });

  const {
    createTerminal,
    adoptTerminal,
    createTerminalWithCmd,
    resumeFromHistory,
    forkTerminal,
    forkTerminalIntoCopy,
    addTerminalToPane,
    addBrowserToPane,
    addMemoryToPane,
    addToolkitToPane,
    addFilesToPane,
    addAutomationsToPane,
    addCommandsToPane,
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
    restoreSessionTitle,
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
    restoreSettled,
    setTree,
    setFocusedPaneId,
    applyTree,
    schedulePersist,
    forward,
  });

  const applyLayout = useApplyLayout({
    projectName,
    treeRef,
    restoreSettled,
    applyTree,
    forward,
    scheduleCmdInject,
  });
  useDefaultLayout(projectName, treeRef, restoreSettled, applyLayout);
  const captureLayout = useCallback(
    () => (treeRef.current ? captureTreeLayout(treeRef.current) : null),
    [treeRef],
  );

  const openUtilityTab = useOpenUtilityTab(treeRef, restoreSettled, focusTerminal);
  const openAutomationsTab = useCallback(
    () => openUtilityTab("automations", addAutomationsToPane),
    [openUtilityTab, addAutomationsToPane],
  );
  const openCommandsTab = useCallback(
    () => openUtilityTab("commands", addCommandsToPane),
    [openUtilityTab, addCommandsToPane],
  );
  const openBrowserTab = useOpenBrowserTab(
    projectName,
    treeRef,
    restoreSettled,
    focusTerminal,
    addBrowserToPane,
  );

  const {
    closeTerminal,
    closeOtherTerminals,
    closePane,
    closeTerminalById,
    closeOthersById,
    closeTerminalsById,
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
    remoteForkTerminal,
    remoteForkIntoCopy,
    remoteCloseOthers,
    removeAdoptedTerminal,
    remoteRenameTerminal,
    remoteRestoreTitle,
    remoteTogglePin,
    remoteReorderTerminals,
  } = useRemoteTabControls({
    treeRef,
    restoreSettled,
    closeTerminal,
    renameTerminal,
    restoreSessionTitle,
    toggleTabPinned,
    reorderTerminals,
    closeTerminalsById,
    forkTerminal,
    forkTerminalIntoCopy,
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
    switchClaudeAccount,
    addTerminalToPane,
    addBrowserToPane,
    addMemoryToPane,
    addToolkitToPane,
    addFilesToPane,
    addAutomationsToPane,
    addCommandsToPane,
    closeTerminalById,
    closeOthersById,
    focusTerminal,
    focusService,
    renameTerminal,
    restoreSessionTitle,
    toggleTabPinned,
    reorderTerminals,
    moveTerminal,
    splitPane,
    applyLayout,
    captureLayout,
    closePane,
    setRatio,
    focusPane,
    ensureRootPane,
    noteTerminalMemory,
    detachTerminalMemory,
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
          // A peer terminal belongs to the other machine, which keeps it running
          // on purpose — that is the whole point of a host: you switch away, and
          // the agent carries on. Stopping it here would kill a live session
          // (mid-run agent included) merely because this project stopped being
          // the one on screen, and the next visit would adopt nothing.
          if (isPeerName(t.id)) return;
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
    restoreSettled,
    createTerminal,
    createTerminalWithCmd,
    adoptTerminal,
    resumeFromHistory,
    forkTerminal,
    forkTerminalIntoCopy,
    addTerminalToPane,
    addBrowserToPane,
    addMemoryToPane,
    addToolkitToPane,
    addFilesToPane,
    addAutomationsToPane,
    addCommandsToPane,
    openAutomationsTab,
    openCommandsTab,
    openBrowserTab,
    closeTerminal,
    closeOtherTerminals,
    restartTerminal,
    switchClaudeAccount,
    focusTerminal,
    focusAdjacentPaneItem,
    focusService,
    renameTerminal,
    restoreSessionTitle,
    toggleTabPinned,
    reorderTerminals,
    remoteCloseTerminal,
    remoteForkTerminal,
    remoteForkIntoCopy,
    remoteCloseOthers,
    removeAdoptedTerminal,
    remoteRenameTerminal,
    remoteRestoreTitle,
    remoteTogglePin,
    remoteReorderTerminals,
    moveTerminal,
    splitPane,
    applyLayout,
    captureLayout,
    closePane,
    setRatio,
    focusPane,
    ensureRootPane,
    getFocusedPane,
    getPane,
    noteTerminalMemory,
    detachTerminalMemory,
  };
}
