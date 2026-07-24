import { useRef, useCallback, type RefObject } from "react";
import { toast } from "sonner";
import { StopTerminal, ClearPaneStatus } from "../../../bridge/commands";
import { disposeInteractivePaneSession } from "../../components/InteractivePane";
import { forgetComposerDraft } from "../../store/composerDrafts";
import { showUndoCloseToast } from "../../components/UndoCloseToast";
import {
  pendingClosesForProject,
  registerPendingClose,
  takePendingClose,
} from "../../pendingClose";
import {
  appendHistoryEntry,
  getProjectTerminals,
  updateProjectTerminalsCache,
} from "../../terminals";
import {
  type PaneNode,
  type PaneLeaf,
  type TerminalInstance,
  makePaneLeaf,
  isTerminalTab,
  findPane,
  firstPaneId,
  siblingPaneId,
  mapPane,
  removePane,
  isTabPinned,
} from "../../paneTree";
import { IS_MIRROR_WINDOW } from "../../mirror";
import { nextId, appendTerminal, resolveActiveAfterClose } from "./util";

// Grace period the closed tab stays recoverable behind the undo toast.
const UNDO_CLOSE_DURATION_MS = 3000;

interface UseTabCloseProps {
  projectName: string;
  treeRef: RefObject<PaneNode | null>;
  focusedRef: RefObject<string | null>;
  applyTree: (next: PaneNode | null, focus?: string | null) => void;
  forward: (kind: string, ...args: unknown[]) => void;
  getPane: (paneId: string) => PaneLeaf | null;
}

export function useTabClose({
  projectName,
  treeRef,
  focusedRef,
  applyTree,
  forward,
  getPane,
}: UseTabCloseProps) {
  // Drop a pane from the tree, moving focus to its visual neighbor (or the
  // first remaining pane when the closed pane was the root).
  const collapsePane = useCallback(
    (current: PaneNode, paneId: string) => {
      const sibling = siblingPaneId(current, paneId);
      const next = removePane(current, paneId);
      applyTree(next, next ? (sibling ?? firstPaneId(next)) : null);
    },
    [applyTree],
  );

  const recordClosingTabs = useCallback(
    (tabs: TerminalInstance[]) => {
      const eligible = tabs.filter((t): t is TerminalInstance & { resumeCmd: string } =>
        Boolean(t.resumeCmd),
      );
      if (eligible.length === 0) return;
      let state = getProjectTerminals(projectName);
      const closedAt = Date.now();
      for (const t of eligible) {
        state = appendHistoryEntry(state, {
          label: t.label,
          startCmd: t.startCmd,
          resumeCmd: t.resumeCmd,
          actionName: t.actionName,
          closedAt,
        });
      }
      updateProjectTerminalsCache(projectName, state);
    },
    [projectName],
  );

  // Releases back-end resources for a set of closing tabs (stop the process,
  // clear any pane status) and records them in history. Both close paths — one
  // tab, or all-but-one — funnel through here so teardown lives in one place.
  const disposeTabs = useCallback(
    (tabs: TerminalInstance[], stop = true) => {
      for (const t of tabs) {
        // A peer-closed terminal is already dead on the backend; skip the stop
        // so no redundant stop_terminal is issued.
        if (stop) StopTerminal(t.id).catch(() => {});
        if (isTerminalTab(t)) {
          ClearPaneStatus(projectName, t.id).catch(() => {});
        }
      }
      recordClosingTabs(tabs);
    },
    [recordClosingTabs, projectName],
  );

  // Runs the deferred teardown once the undo window closes (toast auto-closed,
  // dismissed, or the project view unmounts). Idempotent: `takePendingClose`
  // claims the entry so a second trigger — sonner can fire onDismiss right after
  // an unmount-driven finalize — is a no-op.
  const finalizePendingClose = useCallback(
    (id: string) => {
      const entry = takePendingClose(id);
      if (!entry || entry.finalized) return;
      entry.finalized = true;
      disposeTabs([entry.tab]);
      disposeInteractivePaneSession(id);
      forgetComposerDraft(id);
      toast.dismiss(entry.toastId);
    },
    [disposeTabs],
  );

  // Restores a pending-close tab into the tree. The PTY and xterm buffer were
  // never torn down, so re-inserting the same tab object reattaches the live
  // session by id and scrollback survives. Prefers the original pane+index; if
  // that pane collapsed while the toast was up, falls back to the focused (or
  // first) leaf, and recreates a root pane if the whole tree is gone.
  const undoPendingClose = useCallback(
    (id: string) => {
      const entry = takePendingClose(id);
      if (!entry || entry.finalized) return;
      entry.finalized = true;
      toast.dismiss(entry.toastId);
      const current = treeRef.current;
      const pane = current ? findPane(current, entry.paneId) : null;
      if (current && pane) {
        const insertAt = Math.min(entry.tabIdx, pane.tabs.length);
        const next = mapPane(current, entry.paneId, (p) => ({
          ...p,
          tabs: [...p.tabs.slice(0, insertAt), entry.tab, ...p.tabs.slice(insertAt)],
          activeTabIdx: insertAt,
          activeServiceName: undefined,
        }));
        applyTree(next, entry.paneId);
        return;
      }
      if (current) {
        const focused = focusedRef.current;
        const target =
          focused && findPane(current, focused) ? focused : firstPaneId(current);
        applyTree(mapPane(current, target, (p) => appendTerminal(p, entry.tab)), target);
        return;
      }
      const paneId = nextId("pane");
      applyTree(makePaneLeaf(paneId, [entry.tab], 0), paneId);
    },
    [applyTree],
  );

  // Register a closing terminal tab for undo and raise its toast instead of
  // tearing it down now. Product-language copy only — no PTY/session wording.
  const beginPendingClose = useCallback(
    (pane: PaneLeaf, tabIdx: number) => {
      const tab = pane.tabs[tabIdx];
      const toastId = `close-tab-${tab.id}`;
      registerPendingClose({
        tab,
        paneId: pane.id,
        tabIdx,
        projectName,
        toastId,
        finalized: false,
      });
      showUndoCloseToast({
        toastId,
        label: tab.label,
        durationMs: UNDO_CLOSE_DURATION_MS,
        onUndo: () => undoPendingClose(tab.id),
        onFinalize: () => finalizePendingClose(tab.id),
      });
    },
    [projectName, undoPendingClose, finalizePendingClose],
  );

  const finalizePendingCloseRef = useRef(finalizePendingClose);
  finalizePendingCloseRef.current = finalizePendingClose;

  const closeTerminal = useCallback(
    (paneId: string, tabIdx: number, opts?: { stop?: boolean; force?: boolean }) => {
      // Forward by tab id, not index: the mirror's local tree lags the owner's
      // echoed broadcast, so a second close click within that window would carry
      // a stale index and the owner would close whatever tab now sits there —
      // potentially killing a live session's PTY. The owner resolves the id
      // against its authoritative tree (or no-ops if already gone).
      const current = treeRef.current;
      if (!current) return;
      if (IS_MIRROR_WINDOW) {
        const id = findPane(current, paneId)?.tabs[tabIdx]?.id;
        if (id) forward("closeTerminalById", paneId, id);
        return;
      }
      const pane = findPane(current, paneId);
      if (!pane || !pane.tabs[tabIdx]) return;
      // `force` (a peer-close removing a dead tab) bypasses the pin guard.
      if (!opts?.force && isTabPinned(pane, tabIdx)) return;
      const tab = pane.tabs[tabIdx];
      // Real terminal tabs closed through the normal path defer teardown behind
      // an undo toast; a peer-driven close (stop === false, PTY already dead)
      // and non-PTY tabs (browser/review) tear down immediately.
      if ((opts?.stop ?? true) && isTerminalTab(tab)) {
        beginPendingClose(pane, tabIdx);
      } else {
        disposeTabs([tab], opts?.stop ?? true);
      }

      // Collapse the pane only when it would otherwise be empty — panes
      // that hold a persistent service tab stay alive even with no
      // interactive terminals.
      if (pane.tabs.length === 1 && !pane.activeServiceName) {
        collapsePane(current, paneId);
        return;
      }

      const newTabs = pane.tabs.filter((_, i) => i !== tabIdx);
      const newActive = resolveActiveAfterClose(pane.activeTabIdx, tabIdx, newTabs.length);
      const next = mapPane(current, paneId, (p) => ({ ...p, tabs: newTabs, activeTabIdx: newActive }));
      applyTree(next);
    },
    [applyTree, collapsePane, disposeTabs, beginPendingClose, forward],
  );

  // Closes every unpinned tab in the pane except the one at `tabIdx`; pinned
  // tabs and the selected tab always survive, so the pane never empties and
  // needs no collapse. The kept tab becomes active.
  const closeOtherTerminals = useCallback(
    (paneId: string, tabIdx: number) => {
      // Forward by the kept tab's id (see closeTerminal) so a stale index can't
      // make the owner keep the wrong tab and close everything else.
      const current = treeRef.current;
      if (!current) return;
      if (IS_MIRROR_WINDOW) {
        const id = findPane(current, paneId)?.tabs[tabIdx]?.id;
        if (id) forward("closeOthersById", paneId, id);
        return;
      }
      const pane = findPane(current, paneId);
      const keptTab = pane?.tabs[tabIdx];
      if (!pane || !keptTab) return;
      const closing = pane.tabs.filter((t, i) => i !== tabIdx && t.pinned !== true);
      if (closing.length === 0) return;
      disposeTabs(closing);

      const newTabs = pane.tabs.filter((t, i) => i === tabIdx || t.pinned === true);
      const newActive = newTabs.findIndex((t) => t.id === keptTab.id);
      const next = mapPane(current, paneId, (p) => ({ ...p, tabs: newTabs, activeTabIdx: newActive }));
      applyTree(next);
    },
    [applyTree, disposeTabs, forward],
  );

  const closePane = useCallback(
    (paneId: string) => {
      if (IS_MIRROR_WINDOW) return forward("closePane", paneId);
      const current = treeRef.current;
      if (!current) return;
      const pane = findPane(current, paneId);
      if (!pane) return;
      pane.tabs.forEach((t) => {
        StopTerminal(t.id).catch(() => {});
        if (isTerminalTab(t)) {
          ClearPaneStatus(projectName, t.id).catch(() => {});
        }
      });
      recordClosingTabs(pane.tabs);
      collapsePane(current, paneId);
    },
    [collapsePane, recordClosingTabs, projectName, forward],
  );

  // Owner-side resolvers for the mirror's id-addressed close actions: map the
  // terminal id back to its current index in the authoritative tree, then run
  // the normal close. A no-longer-present id is a safe no-op (the tab already
  // closed), which is exactly the double-click case index-based close got wrong.
  const closeTerminalById = useCallback(
    (paneId: string, termId: string) => {
      const idx = getPane(paneId)?.tabs.findIndex((t) => t.id === termId) ?? -1;
      if (idx >= 0) closeTerminal(paneId, idx);
    },
    [getPane, closeTerminal],
  );
  const closeOthersById = useCallback(
    (paneId: string, termId: string) => {
      const idx = getPane(paneId)?.tabs.findIndex((t) => t.id === termId) ?? -1;
      if (idx >= 0) closeOtherTerminals(paneId, idx);
    },
    [getPane, closeOtherTerminals],
  );

  // Teardown helper for the orchestrator's unmount effect: pending-close tabs
  // aren't in the tree, so the unmount's stop loop won't stop their PTYs —
  // finalize each now so nothing orphans on unmount/quit.
  const finalizePendingClosesForProject = useCallback(() => {
    for (const entry of pendingClosesForProject(projectName)) {
      finalizePendingCloseRef.current(entry.tab.id);
    }
  }, [projectName]);

  return {
    closeTerminal,
    closeOtherTerminals,
    closePane,
    closeTerminalById,
    closeOthersById,
    finalizePendingClosesForProject,
  };
}
