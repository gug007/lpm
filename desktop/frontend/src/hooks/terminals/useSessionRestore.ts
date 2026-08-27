import { useEffect, type Dispatch, type SetStateAction, type RefObject } from "react";
import { StopTerminal } from "../../../bridge/commands";
import {
  collectPersistedTabs,
  getProjectTerminals,
  rememberLostSessions,
  type PersistedTab,
} from "../../terminals";
import {
  type PaneNode,
  collectTerminals,
  firstPaneId,
  paneAtPath,
} from "../../paneTree";
import {
  IS_MIRROR_WINDOW,
  onMirrorTree,
  requestMirrorTree,
} from "../../mirror";
import { reifyTreeWithFreshPtys, legacyEntriesToTree } from "./persistedTree";

interface UseSessionRestoreProps {
  projectName: string;
  treeRef: RefObject<PaneNode | null>;
  focusedRef: RefObject<string | null>;
  onCountRef: RefObject<((count: number) => void) | undefined>;
  restoreSettled: RefObject<Promise<void>>;
  setTree: Dispatch<SetStateAction<PaneNode | null>>;
  setFocusedPaneId: Dispatch<SetStateAction<string | null>>;
  applyTree: (next: PaneNode | null, focus?: string | null) => void;
  persist: (next: PaneNode | null) => void;
  holdPersistedPanes: () => void;
  scheduleCmdInject: (id: string, cmd: string, prompt?: string | string[]) => void;
}

export function useSessionRestore({
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
}: UseSessionRestoreProps) {
  // Restore saved tree on mount. Each leaf's terminals get re-launched
  // with fresh PTY ids; restore commands are re-injected (resumeCmd takes
  // precedence so programs with session resume land back in their
  // previous conversation instead of restarting fresh). Falls back to
  // converting the legacy terminals[] array into a single root pane.
  useEffect(() => {
    // Mirror window: don't reify fresh PTYs. Adopt the owner's LIVE tree (same
    // process-global PTY ids) over the cross-window channel and keep it synced.
    // Re-request until the owner answers so mount ordering doesn't matter.
    if (IS_MIRROR_WINDOW) {
      let gotTree = false;
      const off = onMirrorTree(projectName, (payload) => {
        gotTree = true;
        setTree(payload.tree);
        setFocusedPaneId(payload.focusedPaneId);
        onCountRef.current?.(payload.tree ? collectTerminals(payload.tree).length : 0);
      });
      requestMirrorTree(projectName);
      const retry = setInterval(() => {
        if (gotTree) clearInterval(retry);
        else requestMirrorTree(projectName);
      }, 500);
      const stopRetry = setTimeout(() => clearInterval(retry), 10000);
      // Self-heal on activation: if this mirror's tree went stale for any
      // reason (owner remounted and lost its armed state, retries expired,
      // a broadcast was missed), re-syncing costs one request+answer.
      const onWinFocus = () => requestMirrorTree(projectName);
      window.addEventListener("focus", onWinFocus);
      return () => {
        off();
        clearInterval(retry);
        clearTimeout(stopRetry);
        window.removeEventListener("focus", onWinFocus);
      };
    }

    const saved = getProjectTerminals(projectName);
    const persistedTree = saved.panes ?? legacyEntriesToTree(saved.terminals);
    if (!persistedTree) return;

    let settle!: () => void;
    restoreSettled.current = new Promise((r) => (settle = r));

    // Pane ids are regenerated on reify, so we look the previously focused
    // pane up by its position in the tree and map it to its new id.
    const savedFocusedPath = saved.focusedPanePath;
    let cancelled = false;
    const allStartedIds: string[] = [];

    (async () => {
      const dropped: PersistedTab[] = [];
      const discarded: PersistedTab[] = [];
      const restored = await reifyTreeWithFreshPtys(
        persistedTree,
        projectName,
        allStartedIds,
        dropped,
        discarded,
      );
      if (cancelled || !restored) {
        allStartedIds.forEach((id) => StopTerminal(id).catch(() => {}));
        if (!cancelled) {
          // Nothing came back. When every tab was a parked peer tab whose pty is
          // gone, that's a clean outcome, not a failure: write the empty tree so
          // the dead entries stop coming back on every mount. Otherwise hold the
          // saved tabs on disk, so a transient failure (root moved, SSH host
          // down) doesn't erase them for good.
          const cleanlyEmpty = dropped.length === 0 && discarded.length > 0;
          if (cleanlyEmpty) persist(null);
          else holdPersistedPanes();
          // Either way the sessions left the tree, so file them in history to
          // stay reachable from "Resume session".
          void rememberLostSessions(
            projectName,
            cleanlyEmpty ? discarded : collectPersistedTabs(persistedTree),
          );
          onCountRef.current?.(0);
        }
        settle();
        return;
      }
      void rememberLostSessions(projectName, [...dropped, ...discarded]);
      setTree(restored);
      // Sync the ref now: a create awaiting `restoreSettled` resumes in a
      // microtask, before the re-render updates treeRef, and must append to
      // the restored tree rather than start a fresh root pane.
      treeRef.current = restored;
      const savedFocusedLeaf = savedFocusedPath
        ? paneAtPath(restored, savedFocusedPath)
        : null;
      const focused = savedFocusedLeaf?.id ?? firstPaneId(restored);
      setFocusedPaneId(focused);
      focusedRef.current = focused;
      // Write the tree we actually ended up with. Restore mints ids but reaches
      // disk through nothing else (persist() runs from applyTree/schedulePersist,
      // and restore uses the raw setters), so without this the saved id stays
      // frozen at the first one ever minted and every later launch asks about a
      // dead pty — starting another terminal beside one still running.
      //
      // Only when nothing failed. Discards are fine to write out — erasing them
      // is the point — but a `dropped` tab still has a live session behind it,
      // and writing the tree without it is the erasure holdPersistedPanes()
      // exists to prevent.
      if (dropped.length === 0) persist(restored);
      const all = collectTerminals(restored);
      onCountRef.current?.(all.length);
      // Only into ptys this restore launched. The others were adopted from a
      // peer that kept them running while we were closed, so their program is
      // already up — typing the launch command again would land in a live
      // agent's prompt.
      const launched = new Set(allStartedIds);
      all.forEach((t) => {
        if (!launched.has(t.id)) return;
        const cmd = t.resumeCmd ?? t.startCmd;
        if (cmd) scheduleCmdInject(t.id, cmd);
      });
      settle();
    })();

    return () => {
      cancelled = true;
      settle();
      allStartedIds.forEach((id) => StopTerminal(id).catch(() => {}));
    };
  }, [projectName, scheduleCmdInject]);

}
