import { useRef, useCallback, type Dispatch, type SetStateAction, type RefObject } from "react";
import { StartTerminal, StopTerminal } from "../../../bridge/commands";
import { terminalStartFailed } from "./terminalStartFailed";
import {
  type PaneNode,
  type PaneLeaf,
  type SplitDirection,
  type TerminalInstance,
  applyManualTerminalRename,
  collectTerminals,
  clearManualTerminalTitle,
  makePaneLeaf,
  makeTerminal,
  adjacentPaneHeaderItem,
  findPane,
  firstPaneId,
  mapPane,
  setRatioAtPath,
  splitAtPane,
} from "../../paneTree";
import { pickTerminalLabel } from "../../terminalLabels";
import { IS_MIRROR_WINDOW } from "../../mirror";
import { tellHost } from "../../peer/tellHost";
import { nextId } from "./util";
import { detachTab, moveTabToNewPane, type PaneEdge } from "../../paneMoves";
import { DEFAULT_SHELL } from "../../shells";

interface UsePaneOpsProps {
  projectName: string;
  treeRef: RefObject<PaneNode | null>;
  focusedRef: RefObject<string | null>;
  restoreSettled: RefObject<Promise<void>>;
  setTree: Dispatch<SetStateAction<PaneNode | null>>;
  setFocusedPaneId: Dispatch<SetStateAction<string | null>>;
  applyTree: (next: PaneNode | null, focus?: string | null) => void;
  schedulePersist: () => void;
  forward: (kind: string, ...args: unknown[]) => void;
}

export function usePaneOps({
  projectName,
  treeRef,
  focusedRef,
  restoreSettled,
  setTree,
  setFocusedPaneId,
  applyTree,
  schedulePersist,
  forward,
}: UsePaneOpsProps) {
  const ratioForwardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const focusTerminal = useCallback(
    (paneId: string, tabIdx: number) => {
      const current = treeRef.current;
      if (!current) return;
      const pane = findPane(current, paneId);
      if (!pane) return;
      if (pane.activeTabIdx === tabIdx && pane.activeServiceName === undefined) return;
      if (IS_MIRROR_WINDOW) forward("focusTerminal", paneId, tabIdx);
      const next = mapPane(current, paneId, (p) => ({
        ...p,
        activeTabIdx: tabIdx,
        activeServiceName: undefined,
      }));
      applyTree(next, paneId);
    },
    [applyTree, forward],
  );

  const focusService = useCallback(
    (paneId: string, serviceName: string) => {
      const current = treeRef.current;
      if (!current) return;
      const pane = findPane(current, paneId);
      if (!pane || pane.activeServiceName === serviceName) return;
      if (IS_MIRROR_WINDOW) forward("focusService", paneId, serviceName);
      const next = mapPane(current, paneId, (p) => ({ ...p, activeServiceName: serviceName }));
      applyTree(next, paneId);
    },
    [applyTree, forward],
  );

  const focusAdjacentPaneItem = useCallback(
    (paneId: string, delta: 1 | -1, serviceNames: string[]) => {
      const current = treeRef.current;
      if (!current) return;
      const pane = findPane(current, paneId);
      if (!pane) return;
      // Services render only in the first leaf's header; elsewhere the pane
      // cycles its tabs alone.
      const names = paneId === firstPaneId(current) ? serviceNames : [];
      const target = adjacentPaneHeaderItem(pane, names, delta);
      if (!target) return;
      if (target.kind === "service") focusService(paneId, target.name);
      else focusTerminal(paneId, target.idx);
    },
    [focusTerminal, focusService],
  );

  const ensureRootPane = useCallback(
    async (initialServiceName?: string) => {
      if (treeRef.current) return;
      // Owner-only: the pane id must be minted once, in the tree of record.
      if (IS_MIRROR_WINDOW) return forward("ensureRootPane", initialServiceName);
      // A running project calls this on mount, while the restore is still
      // spawning its PTYs and the tree is legitimately null. Creating a root
      // pane now would persist an empty tab list over the saved one before the
      // restored tabs land, so the next launch would have nothing to restore.
      await restoreSettled.current;
      if (treeRef.current) return;
      const paneId = nextId("pane");
      const pane = makePaneLeaf(paneId, [], 0);
      if (initialServiceName) pane.activeServiceName = initialServiceName;
      applyTree(pane, paneId);
    },
    [applyTree, forward],
  );

  const renameTerminal = useCallback(
    (paneId: string, tabIdx: number, label: string, emoji?: string) => {
      const current = treeRef.current;
      if (!current) return;
      if (IS_MIRROR_WINDOW) forward("renameTerminal", paneId, tabIdx, label, emoji);
      const next = mapPane(current, paneId, (p) => ({
        ...p,
        tabs: p.tabs.map((t, i) => {
          if (i !== tabIdx) return t;
          return applyManualTerminalRename(t, label, emoji);
        }),
      }));
      applyTree(next);
      const id = findPane(current, paneId)?.tabs[tabIdx]?.id;
      if (id) tellHost(projectName, "rename", { id, label, emoji });
    },
    [applyTree, forward, projectName],
  );

  const restoreSessionTitle = useCallback(
    (paneId: string, tabIdx: number) => {
      const current = treeRef.current;
      if (!current) return;
      if (IS_MIRROR_WINDOW) forward("restoreSessionTitle", paneId, tabIdx);
      const next = mapPane(current, paneId, (p) => ({
        ...p,
        tabs: p.tabs.map((t, i) =>
          i === tabIdx ? clearManualTerminalTitle(t) : t,
        ),
      }));
      applyTree(next);
      const id = findPane(current, paneId)?.tabs[tabIdx]?.id;
      if (id) tellHost(projectName, "title", { id });
    },
    [applyTree, forward, projectName],
  );

  const toggleTabPinned = useCallback(
    (paneId: string, tabIdx: number) => {
      const current = treeRef.current;
      if (!current) return;
      const pane = findPane(current, paneId);
      if (!pane || !pane.tabs[tabIdx]) return;
      if (IS_MIRROR_WINDOW) forward("toggleTabPinned", paneId, tabIdx);
      const next = mapPane(current, paneId, (p) => ({
        ...p,
        tabs: p.tabs.map((t, i) =>
          i === tabIdx ? { ...t, pinned: !t.pinned } : t,
        ),
      }));
      applyTree(next);
      tellHost(projectName, "pin", { id: pane.tabs[tabIdx].id });
    },
    [applyTree, forward, projectName],
  );

  // Reorder follows the active terminal by id rather than by index so the
  // user's focused tab stays focused after the drop, even if its position
  // shifted.
  const reorderTerminals = useCallback(
    (paneId: string, order: string[]) => {
      const current = treeRef.current;
      if (!current) return;
      const pane = findPane(current, paneId);
      if (!pane || order.length !== pane.tabs.length) return;

      const byId = new Map(pane.tabs.map((t) => [t.id, t]));
      const newTabs: TerminalInstance[] = [];
      for (const id of order) {
        const t = byId.get(id);
        if (!t) return;
        newTabs.push(t);
      }

      const activeId = pane.tabs[pane.activeTabIdx]?.id;
      const activeIdx = activeId ? newTabs.findIndex((t) => t.id === activeId) : -1;
      const newActive = activeIdx >= 0 ? activeIdx : pane.activeTabIdx;
      if (newActive === pane.activeTabIdx && newTabs.every((t, i) => t.id === pane.tabs[i].id)) {
        return;
      }

      if (IS_MIRROR_WINDOW) forward("reorderTerminals", paneId, order);
      const next = mapPane(current, paneId, (p) => ({
        ...p,
        tabs: newTabs,
        activeTabIdx: newActive,
      }));
      applyTree(next);
      tellHost(projectName, "reorder", { order: collectTerminals(next).map((t) => t.id) });
    },
    [applyTree, forward, projectName],
  );

  // Collapses the source pane when the move empties it, matching the
  // closeTerminal rule — panes with a persistent service tab stay alive.
  const moveTerminal = useCallback(
    (fromPaneId: string, termId: string, toPaneId: string, toIdx?: number) => {
      if (fromPaneId === toPaneId) return;
      if (IS_MIRROR_WINDOW) forward("moveTerminal", fromPaneId, termId, toPaneId, toIdx);
      const current = treeRef.current;
      if (!current || !findPane(current, toPaneId)) return;
      const detached = detachTab(current, fromPaneId, termId);
      if (!detached?.tree) return;
      const term = detached.term;

      const next = mapPane(detached.tree, toPaneId, (p) => {
        const insertAt =
          toIdx === undefined
            ? p.tabs.length
            : Math.max(0, Math.min(toIdx, p.tabs.length));
        const tabs = [
          ...p.tabs.slice(0, insertAt),
          term,
          ...p.tabs.slice(insertAt),
        ];
        return {
          ...p,
          tabs,
          activeTabIdx: insertAt,
          activeServiceName: undefined,
        };
      });

      applyTree(next, toPaneId);
    },
    [applyTree, forward],
  );

  // A tab dropped on a pane's edge, or sent there from its menu, lands in a new
  // pane on that side. Owner-only, like a split: the new pane id is minted once,
  // in the tree of record.
  const moveTerminalToNewPane = useCallback(
    (fromPaneId: string, termId: string, targetPaneId: string, edge: PaneEdge) => {
      if (IS_MIRROR_WINDOW) return forward("moveTerminalToNewPane", fromPaneId, termId, targetPaneId, edge);
      const current = treeRef.current;
      if (!current) return;
      const newPaneId = nextId("pane");
      const next = moveTabToNewPane(current, fromPaneId, termId, targetPaneId, edge, newPaneId);
      if (next) applyTree(next, newPaneId);
    },
    [applyTree, forward],
  );

  const splitPane = useCallback(
    async (paneId: string, direction: SplitDirection) => {
      if (IS_MIRROR_WINDOW) return forward("splitPane", paneId, direction);
      if (!treeRef.current || !findPane(treeRef.current, paneId)) return;
      let newId: string;
      try {
        newId = await StartTerminal(projectName, undefined, undefined, undefined, undefined, DEFAULT_SHELL);
      } catch (err) {
        terminalStartFailed(err);
        return;
      }
      // Re-verify the pane still exists after the async PTY start — if the
      // user closed it in the meantime, drop the new PTY to avoid leaking.
      const current = treeRef.current;
      if (!current || !findPane(current, paneId)) {
        StopTerminal(newId).catch(() => {});
        return;
      }
      const newPaneId = nextId("pane");
      const newPane = makePaneLeaf(
        newPaneId,
        [makeTerminal(newId, pickTerminalLabel(current), { shell: DEFAULT_SHELL })],
        0,
      );
      applyTree(splitAtPane(current, paneId, direction, newPane), newPaneId);
    },
    [projectName, applyTree, forward],
  );

  // Divider drag mutates the tree on every frame. setRatioAtPath returns
  // the same reference when the clamped ratio is unchanged, so drags that
  // clamp against the min/max snap produce zero renders.
  const setRatio = useCallback(
    (path: number[], ratio: number) => {
      const current = treeRef.current;
      if (!current) return;
      const next = setRatioAtPath(current, path, ratio);
      if (next === current) return;
      setTree(next);
      if (IS_MIRROR_WINDOW) {
        // Local-first for a smooth drag; forward only the settled ratio so the
        // owner's echoed broadcasts (up to 80ms stale) can't rubber-band the
        // divider mid-drag.
        if (ratioForwardTimer.current) clearTimeout(ratioForwardTimer.current);
        ratioForwardTimer.current = setTimeout(() => {
          ratioForwardTimer.current = null;
          forward("setRatio", path, ratio);
        }, 150);
        return;
      }
      schedulePersist();
    },
    [schedulePersist, forward],
  );

  const focusPane = useCallback(
    (paneId: string) => {
      if (focusedRef.current === paneId) return;
      const current = treeRef.current;
      if (!current || !findPane(current, paneId)) return;
      if (IS_MIRROR_WINDOW) forward("focusPane", paneId);
      setFocusedPaneId(paneId);
      // Sync ref so the debounced persist reads the just-clicked pane id.
      focusedRef.current = paneId;
      schedulePersist();
    },
    [schedulePersist, forward],
  );

  const getFocusedPane = useCallback((): PaneLeaf | null => {
    const t = treeRef.current;
    const f = focusedRef.current;
    return t && f ? findPane(t, f) : null;
  }, []);

  const getPane = useCallback((paneId: string): PaneLeaf | null => {
    return treeRef.current ? findPane(treeRef.current, paneId) : null;
  }, []);

  // Teardown helper for the orchestrator's unmount effect: clear a pending
  // ratio-forward timer.
  const clearRatioForwardTimer = useCallback(() => {
    if (ratioForwardTimer.current) {
      clearTimeout(ratioForwardTimer.current);
      ratioForwardTimer.current = null;
    }
  }, []);

  return {
    focusTerminal,
    focusService,
    focusAdjacentPaneItem,
    ensureRootPane,
    renameTerminal,
    restoreSessionTitle,
    toggleTabPinned,
    reorderTerminals,
    moveTerminal,
    moveTerminalToNewPane,
    splitPane,
    setRatio,
    focusPane,
    getFocusedPane,
    getPane,
    clearRatioForwardTimer,
  };
}
