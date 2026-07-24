import { useEffect, type Dispatch, type SetStateAction, type RefObject } from "react";
import { StopTerminal } from "../../../bridge/commands";
import { EventsOn } from "../../../bridge/runtime";
import { getProjectTerminals } from "../../terminals";
import { buildCodexResumeCmd } from "../../codexResume";
import {
  type PaneNode,
  isTerminalTab,
  collectPanes,
  collectTerminals,
  firstPaneId,
  mapPane,
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
      const restored = await reifyTreeWithFreshPtys(persistedTree, projectName, allStartedIds);
      if (cancelled || !restored) {
        allStartedIds.forEach((id) => StopTerminal(id).catch(() => {}));
        if (!cancelled) onCountRef.current?.(0);
        settle();
        return;
      }
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
      const all = collectTerminals(restored);
      onCountRef.current?.(all.length);
      all.forEach((t) => {
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

  // Codex has no launch-time session id, so its SessionStart hook reports the
  // real id back through the socket -> `codex-session` event. Upgrade the tab's
  // resumeCmd after the fact: a non-empty resumeCmd flows through persistence,
  // restore injection, and history exactly like the Claude case. Owner windows
  // only — the mirror never owns the persisted tree.
  useEffect(() => {
    if (IS_MIRROR_WINDOW) return;
    const cancel = EventsOn(
      "codex-session",
      (payload: { project: string; paneId: string; sessionId: string }) => {
        if (!payload?.project || !payload?.paneId || !payload?.sessionId) return;
        if (payload.project !== projectName) return;
        const current = treeRef.current;
        if (!current) return;
        const host = collectPanes(current).find((p) =>
          p.tabs.some((t) => t.id === payload.paneId && isTerminalTab(t)),
        );
        if (!host) return;
        const next = mapPane(current, host.id, (p) => ({
          ...p,
          tabs: p.tabs.map((t) =>
            t.id === payload.paneId
              ? { ...t, resumeCmd: buildCodexResumeCmd(t.startCmd, payload.sessionId) }
              : t,
          ),
        }));
        applyTree(next);
      },
    );
    return () => {
      if (typeof cancel === "function") cancel();
    };
  }, [projectName, applyTree]);
}
