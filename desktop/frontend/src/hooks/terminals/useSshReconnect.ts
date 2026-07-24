import { useRef, useEffect, useCallback, type RefObject } from "react";
import {
  StartTerminal,
  StartTerminalForRestore,
  StopTerminal,
  ClearPaneStatus,
  IsTerminalRemote,
} from "../../../bridge/commands";
import { EventsOn } from "../../../bridge/runtime";
import { disposeInteractivePaneSession } from "../../components/InteractivePane";
import { isPendingClose } from "../../pendingClose";
import { isPeerName } from "../../peer/markers";
import {
  reconnectDelayMs,
  shouldReconnect,
  RECONNECT_PROBE_OUTPUT_GRACE_MS,
  RECONNECT_PROBE_WINDOW_MS,
} from "../../reconnect";
import {
  type PaneNode,
  makeTerminal,
  isTerminalTab,
  collectPanes,
  collectTerminals,
  mapPane,
} from "../../paneTree";
import { IS_MIRROR_WINDOW } from "../../mirror";

// Watch a freshly spawned remote PTY long enough to tell a live connection
// from a doomed one: any exit inside the window fails the probe, while output
// followed by a quiet grace (a failing ssh prints its error and exits at once;
// a live shell keeps running after its prompt) passes it early. A session
// producing no output at all passes at the window cap.
function probeTerminalAlive(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    let offExit: unknown;
    let offOutput: unknown;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    const done = (alive: boolean) => {
      clearTimeout(windowTimer);
      if (graceTimer) clearTimeout(graceTimer);
      if (typeof offExit === "function") offExit();
      if (typeof offOutput === "function") offOutput();
      resolve(alive);
    };
    const windowTimer = setTimeout(() => done(true), RECONNECT_PROBE_WINDOW_MS);
    offExit = EventsOn(`pty-exit-${id}`, () => done(false));
    offOutput = EventsOn(`pty-output-${id}`, () => {
      if (graceTimer) return;
      graceTimer = setTimeout(() => done(true), RECONNECT_PROBE_OUTPUT_GRACE_MS);
    });
  });
}

interface UseSshReconnectProps {
  projectName: string;
  tree: PaneNode | null;
  treeRef: RefObject<PaneNode | null>;
  applyTree: (next: PaneNode | null, focus?: string | null) => void;
  scheduleCmdInject: (id: string, cmd: string, prompt?: string | string[]) => void;
}

export function useSshReconnect({
  projectName,
  tree,
  treeRef,
  applyTree,
  scheduleCmdInject,
}: UseSshReconnectProps) {
  // Remote (SSH) terminals whose transport dropped are auto-respawned. We cache
  // each live terminal's remote-ness while it's alive (the backend forgets the
  // session the instant it exits) and track in-flight reconnect attempts so they
  // can be cancelled on close/unmount.
  const remoteCacheRef = useRef<Map<string, boolean>>(new Map());
  const reconnectStateRef = useRef<
    Map<string, { attempt: number; timer: ReturnType<typeof setTimeout> | null; cancelled: boolean }>
  >(new Map());

  // Cancel any in-flight reconnect for a terminal (tab closed, or it succeeded).
  const cancelReconnect = useCallback((id: string) => {
    const state = reconnectStateRef.current.get(id);
    if (state) {
      state.cancelled = true;
      if (state.timer) clearTimeout(state.timer);
      reconnectStateRef.current.delete(id);
    }
  }, []);

  // Respawn a remote terminal whose SSH transport dropped, then re-inject its
  // resume/start command so it lands back in the same session. Spawning always
  // succeeds locally even when the host is down, so the fresh PTY is probed
  // before the swap: only a connection that survives replaces the old pane —
  // until then the dead pane (message + scrollback) stays put and the backoff
  // escalates. Retries until the swap happens or the tab is closed / project
  // unmounts.
  const attemptReconnect = useCallback(
    async (oldId: string) => {
      const state = reconnectStateRef.current.get(oldId);
      if (!state || state.cancelled) return;

      const findHost = (tree: PaneNode | null) =>
        tree
          ? collectPanes(tree).find((p) =>
              p.tabs.some((t) => t.id === oldId && isTerminalTab(t)),
            )
          : undefined;

      const retryLater = () => {
        if (state.cancelled) {
          reconnectStateRef.current.delete(oldId);
          return;
        }
        const delay = reconnectDelayMs(state.attempt + 1);
        state.timer = setTimeout(() => void attemptReconnect(oldId), delay);
      };

      const before = findHost(treeRef.current);
      const beforeTab = before?.tabs.find((t) => t.id === oldId);
      if (!beforeTab || isPendingClose(oldId)) {
        cancelReconnect(oldId);
        return;
      }

      state.attempt += 1;
      let newId: string;
      try {
        newId = beforeTab.actionName
          ? await StartTerminalForRestore(projectName, beforeTab.actionName)
          : await StartTerminal(projectName);
      } catch {
        retryLater();
        return;
      }

      // Exited inside the probe window — the host is still unreachable. The
      // dead PTY already removed itself backend-side; leave the old pane
      // untouched and escalate.
      if (!(await probeTerminalAlive(newId))) {
        retryLater();
        return;
      }

      // The tab may have been closed while the new PTY was starting.
      const after = findHost(treeRef.current);
      const afterTab = after?.tabs.find((t) => t.id === oldId);
      if (state.cancelled || !after || !afterTab || isPendingClose(oldId)) {
        StopTerminal(newId).catch(() => {});
        reconnectStateRef.current.delete(oldId);
        return;
      }

      const swapped = mapPane(treeRef.current!, after.id, (p) => ({
        ...p,
        tabs: p.tabs.map((t) =>
          t.id === oldId
            ? makeTerminal(newId, t.label, {
                historyKey: t.historyKey,
                startCmd: t.startCmd,
                resumeCmd: t.resumeCmd,
                actionName: t.actionName,
                pinned: t.pinned,
                emoji: t.emoji,
                color: t.color,
              })
            : t,
        ),
      }));
      applyTree(swapped);
      ClearPaneStatus(projectName, oldId).catch(() => {});
      // Defer until React commits the swap: the pane still mounted on oldId
      // must unmount before its session is destroyed.
      setTimeout(() => disposeInteractivePaneSession(oldId), 0);
      remoteCacheRef.current.set(newId, true);
      remoteCacheRef.current.delete(oldId);
      reconnectStateRef.current.delete(oldId);

      const cmd = afterTab.resumeCmd ?? afterTab.startCmd;
      if (cmd) scheduleCmdInject(newId, cmd);
    },
    [projectName, applyTree, scheduleCmdInject, cancelReconnect],
  );

  // Arm a reconnect when a remote terminal's PTY exits with the SSH transport
  // code. A clean remote `exit` returns the shell's own code, so only 255
  // qualifies; user-closed or local terminals keep the dead-pane behavior.
  const handlePtyExit = useCallback(
    (id: string, code: number) => {
      const decision = {
        exitCode: code,
        isRemote: remoteCacheRef.current.get(id) ?? false,
        stillInTree:
          !!treeRef.current &&
          collectTerminals(treeRef.current).some(
            (t) => t.id === id && isTerminalTab(t),
          ),
        pendingClose: isPendingClose(id),
      };
      if (!shouldReconnect(decision)) return;
      if (reconnectStateRef.current.has(id)) return;
      reconnectStateRef.current.set(id, { attempt: 0, timer: null, cancelled: false });
      const delay = reconnectDelayMs(1);
      const state = reconnectStateRef.current.get(id)!;
      state.timer = setTimeout(() => void attemptReconnect(id), delay);
    },
    [attemptReconnect],
  );

  // Track each live remote terminal's remote-ness (resolved while it's alive)
  // and subscribe to its exit so a dropped SSH transport triggers a reconnect.
  // Owner windows only; peer terminals live on another Mac and never reconnect
  // from here.
  const liveTerminalIds = tree
    ? collectTerminals(tree)
        .filter((t) => isTerminalTab(t) && !isPeerName(t.id))
        .map((t) => t.id)
    : [];
  const liveIdsKey = liveTerminalIds.join(",");
  useEffect(() => {
    if (IS_MIRROR_WINDOW) return;
    const live = new Set(liveTerminalIds);
    // Forget cache/reconnect state for terminals no longer in the tree.
    for (const id of [...remoteCacheRef.current.keys()]) {
      if (!live.has(id)) remoteCacheRef.current.delete(id);
    }
    for (const id of [...reconnectStateRef.current.keys()]) {
      if (!live.has(id)) cancelReconnect(id);
    }
    for (const id of liveTerminalIds) {
      if (!remoteCacheRef.current.has(id)) {
        IsTerminalRemote(id)
          .then((remote) => remoteCacheRef.current.set(id, !!remote))
          .catch(() => {});
      }
    }
    const unsubs = liveTerminalIds.map((id) =>
      EventsOn(`pty-exit-${id}`, (code: number) => handlePtyExit(id, code)),
    );
    return () => {
      unsubs.forEach((off) => {
        if (typeof off === "function") off();
      });
    };
  }, [liveIdsKey, handlePtyExit, cancelReconnect]);

  // Teardown helper for the orchestrator's unmount effect: cancel every
  // in-flight reconnect.
  const cancelAllReconnects = useCallback(() => {
    for (const state of reconnectStateRef.current.values()) {
      state.cancelled = true;
      if (state.timer) clearTimeout(state.timer);
    }
    reconnectStateRef.current.clear();
  }, []);

  return { cancelAllReconnects };
}
