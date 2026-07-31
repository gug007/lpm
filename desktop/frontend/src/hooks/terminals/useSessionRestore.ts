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
      const restored = await reifyTreeWithFreshPtys(
        persistedTree,
        projectName,
        allStartedIds,
        dropped,
      );
      if (cancelled || !restored) {
        allStartedIds.forEach((id) => StopTerminal(id).catch(() => {}));
        if (!cancelled) {
          // Nothing came back. Keep the saved tabs on disk so a transient
          // failure doesn't erase them, and file their sessions in history so
          // they stay reachable from "Resume session" meanwhile.
          holdPersistedPanes();
          void rememberLostSessions(projectName, collectPersistedTabs(persistedTree));
          onCountRef.current?.(0);
        }
        settle();
        return;
      }
      if (dropped.length > 0) void rememberLostSessions(projectName, dropped);
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
      // Write the tree we actually ended up with. Restore mints ids — a local pty
      // always, a peer pty whenever the saved one was genuinely gone — and until
      // now none of them reached disk, because persist() is only reached from
      // applyTree/schedulePersist and restore used the raw setters. The saved id
      // therefore stayed frozen at the first one ever minted, so every later
      // launch asked about a dead id, got a truthful "no", and started yet another
      // terminal on the host while the previous one kept running with nothing
      // attached. A single pane with a single tab never repairs itself either:
      // focusPane and focusTerminal both early-return before they persist.
      //
      // Only for a complete restore. A partial one has already dropped tabs into
      // `dropped`, and writing that would delete them from disk — the erasure
      // holdPersistedPanes() exists to prevent.
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
