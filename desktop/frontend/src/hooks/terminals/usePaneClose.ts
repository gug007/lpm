import { useCallback, useRef, type RefObject } from "react";
import { toast } from "../../notifications/toast";
import { HoldPaneStatus, ReleasePaneStatus } from "../../../bridge/commands";
import { disposeInteractivePaneSession } from "../../components/InteractivePane";
import { hasUnsavedFiles } from "../../components/files/fileDrafts";
import { showUndoCloseToast } from "../../components/UndoCloseToast";
import { derivePaneStatus } from "../usePaneStatus";
import { withoutCloseWhenDone } from "../../closeWhenDone";
import { IS_MIRROR_WINDOW } from "../../mirror";
import { paneClosedMessage, runningAgentCount } from "../../paneCloseSummary";
import { paneSpot, restorePane } from "../../paneSpot";
import { findPane, isTerminalTab, type PaneNode, type TerminalInstance } from "../../paneTree";
import {
  UNDO_CLOSE_DURATION_MS,
  pendingPaneClosesForProject,
  registerPendingPaneClose,
  takePendingPaneClose,
} from "../../pendingClose";
import { projectStatusEntries } from "../../projectStatusEntries";
import { forgetComposerDraft } from "../../store/composerDrafts";

interface UsePaneCloseProps {
  projectName: string;
  treeRef: RefObject<PaneNode | null>;
  applyTree: (next: PaneNode | null, focus?: string | null) => void;
  forward: (kind: string, ...args: unknown[]) => void;
  collapsePane: (current: PaneNode, paneId: string) => void;
  disposeTabs: (tabs: TerminalInstance[], stop?: boolean, flush?: boolean) => void;
}

// Closing a pane takes it off the layout at once but holds its tabs — agents
// mid-run included — behind one undo toast, like closing a single tab.
export function usePaneClose({
  projectName,
  treeRef,
  applyTree,
  forward,
  collapsePane,
  disposeTabs,
}: UsePaneCloseProps) {
  const finalizePendingPaneClose = useCallback(
    (paneId: string) => {
      const entry = takePendingPaneClose(paneId);
      if (!entry) return;
      disposeTabs(entry.pane.tabs, true, true);
      for (const t of entry.pane.tabs) {
        disposeInteractivePaneSession(t.id);
        forgetComposerDraft(t.id, t.historyKey);
      }
      toast.dismiss(entry.toastId);
    },
    [disposeTabs],
  );

  // The tabs were never torn down, so putting the same pane object back
  // reattaches every session with its scrollback and active tab.
  const undoPendingPaneClose = useCallback(
    (paneId: string) => {
      const entry = takePendingPaneClose(paneId);
      if (!entry) return;
      toast.dismiss(entry.toastId);
      for (const t of entry.pane.tabs) {
        if (isTerminalTab(t)) ReleasePaneStatus(projectName, t.id).catch(() => {});
      }
      applyTree(restorePane(treeRef.current, entry.pane, entry.spot), entry.pane.id);
    },
    [applyTree, projectName],
  );

  const closePane = useCallback(
    (paneId: string) => {
      if (IS_MIRROR_WINDOW) return forward("closePane", paneId);
      const current = treeRef.current;
      if (!current) return;
      const pane = findPane(current, paneId);
      if (!pane) return;
      const toastId = `close-pane-${paneId}`;
      registerPendingPaneClose({
        pane: { ...pane, tabs: pane.tabs.map(withoutCloseWhenDone) },
        spot: paneSpot(current, paneId),
        projectName,
        toastId,
      });
      for (const t of pane.tabs) {
        if (isTerminalTab(t)) HoldPaneStatus(projectName, t.id).catch(() => {});
      }
      const running = derivePaneStatus(projectStatusEntries(projectName), Date.now()).running;
      showUndoCloseToast({
        toastId,
        ...paneClosedMessage(pane.tabs, runningAgentCount(pane.tabs, running)),
        durationMs: UNDO_CLOSE_DURATION_MS,
        endsHidden: !pane.tabs.some((t) => hasUnsavedFiles(t.id)),
        onUndo: () => undoPendingPaneClose(paneId),
        onFinalize: () => finalizePendingPaneClose(paneId),
      });
      collapsePane(current, paneId);
    },
    [collapsePane, projectName, forward, undoPendingPaneClose, finalizePendingPaneClose],
  );

  const finalizeRef = useRef(finalizePendingPaneClose);
  finalizeRef.current = finalizePendingPaneClose;

  const finalizePendingPaneClosesForProject = useCallback(() => {
    for (const entry of pendingPaneClosesForProject(projectName)) {
      finalizeRef.current(entry.pane.id);
    }
  }, [projectName]);

  return { closePane, finalizePendingPaneClosesForProject };
}
