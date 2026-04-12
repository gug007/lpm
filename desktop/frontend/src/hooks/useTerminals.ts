import { useState, useEffect, useRef, useCallback } from "react";
import { StartTerminal, StartTerminalForConfig, StartTerminalWithCwdEnv, StopTerminal } from "../../wailsjs/go/main/App";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { sendTerminalInput } from "../terminal-io";
import { getProjectTerminals, saveProjectTerminals, type PersistedPaneNode, type PersistedTerminalEntry } from "../terminals";
import {
  type PaneNode,
  type PaneLeaf,
  type SplitDirection,
  type TerminalInstance,
  makePaneLeaf,
  makeTerminal,
  walkPanes,
  collectTerminals,
  findPane,
  firstPaneId,
  siblingPaneId,
  mapPane,
  removePane,
  setRatioAtPath,
  splitAtPane,
  panePath,
  paneAtPath,
} from "../paneTree";

export interface TerminalStartOpts {
  configName?: string;
  cwd?: string;
  env?: Record<string, string>;
  actionName?: string;
}

// Injection waits for pty output to go quiet for PROMPT_IDLE_MS before
// typing a command, bounded by PROMPT_MAX_WAIT_MS in case the shell never
// produces output. A fixed delay isn't enough — a loaded zsh with
// oh-my-zsh/p10k can take well over a second to draw its prompt, and
// typing before the prompt renders echoes the command to a raw TTY.
const PROMPT_IDLE_MS = 150;
const PROMPT_MAX_WAIT_MS = 3000;

// High-frequency events (divider drags, pane focus clicks) mutate state
// on every tick; batch the resulting disk writes to the trailing edge so
// a burst produces ~1 write.
const DEFERRED_PERSIST_MS = 200;

export interface UseTerminalsResult {
  tree: PaneNode | null;
  focusedPaneId: string | null;
  createTerminal: () => Promise<void>;
  createTerminalWithCmd: (label: string, cmd: string, opts?: TerminalStartOpts) => Promise<void>;
  addTerminalToPane: (paneId: string) => Promise<void>;
  closeTerminal: (paneId: string, tabIdx: number) => void;
  focusTerminal: (paneId: string, tabIdx: number) => void;
  focusService: (paneId: string, serviceName: string) => void;
  renameTerminal: (paneId: string, tabIdx: number, label: string) => void;
  reorderTerminals: (paneId: string, order: string[]) => void;
  splitPane: (paneId: string, direction: SplitDirection) => Promise<void>;
  closePane: (paneId: string) => void;
  setRatio: (path: number[], ratio: number) => void;
  focusPane: (paneId: string) => void;
  ensureRootPane: (initialServiceName?: string) => void;
  getFocusedPane: () => PaneLeaf | null;
  getPane: (paneId: string) => PaneLeaf | null;
}

function nextPaneId(): string {
  return `pane-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Produces a label like "Terminal N" where N is the smallest positive
 * integer not already used by an existing terminal in the tree. Avoids
 * duplicates after terminals are closed and re-created in different order.
 */
function pickTerminalLabel(node: PaneNode | null): string {
  if (!node) return "Terminal 1";
  const used = new Set<number>();
  walkPanes(node, (pane) => {
    for (const t of pane.tabs) {
      const match = /^Terminal (\d+)$/.exec(t.label);
      if (match) used.add(parseInt(match[1], 10));
    }
  });
  let n = 1;
  while (used.has(n)) n++;
  return `Terminal ${n}`;
}

function appendTerminal(pane: PaneLeaf, term: TerminalInstance): PaneLeaf {
  return {
    ...pane,
    tabs: [...pane.tabs, term],
    activeTabIdx: pane.tabs.length,
    activeServiceName: undefined,
  };
}

/**
 * Manages the project's pane tree: a split layout where each leaf is a
 * pane with its own list of terminal tabs. Handles restore on mount,
 * persistence on every mutation, and teardown of pty sessions + pending
 * cmd injections on unmount.
 */
export function useTerminals(
  projectName: string,
  onTerminalCountChange?: (count: number) => void,
): UseTerminalsResult {
  const [tree, setTree] = useState<PaneNode | null>(null);
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);

  const treeRef = useRef(tree);
  treeRef.current = tree;
  const focusedRef = useRef(focusedPaneId);
  focusedRef.current = focusedPaneId;
  const onCountRef = useRef(onTerminalCountChange);
  onCountRef.current = onTerminalCountChange;

  const pendingInjectCleanups = useRef<Set<() => void>>(new Set());
  const deferredPersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(
    (next: PaneNode | null) => {
      const focusedId = focusedRef.current;
      const state = getProjectTerminals(projectName);
      saveProjectTerminals(projectName, {
        ...state,
        panes: next ? treeToPersisted(next) : undefined,
        focusedPanePath:
          next && focusedId ? panePath(next, focusedId) ?? undefined : undefined,
        // Drop the legacy terminals[] field on save so the old format
        // doesn't get re-read after a round trip.
        terminals: undefined,
      });
    },
    [projectName],
  );

  const cancelDeferredPersist = useCallback(() => {
    if (deferredPersistTimer.current) {
      clearTimeout(deferredPersistTimer.current);
      deferredPersistTimer.current = null;
    }
  }, []);

  const schedulePersist = useCallback(() => {
    cancelDeferredPersist();
    deferredPersistTimer.current = setTimeout(() => {
      deferredPersistTimer.current = null;
      persist(treeRef.current);
    }, DEFERRED_PERSIST_MS);
  }, [cancelDeferredPersist, persist]);

  const applyTree = useCallback(
    (next: PaneNode | null, focus?: string | null) => {
      cancelDeferredPersist();
      setTree(next);
      if (focus !== undefined) {
        setFocusedPaneId(focus);
        // Sync ref so persist sees the new focus without waiting for the
        // next render's ref assignment.
        focusedRef.current = focus;
      }
      persist(next);
      onCountRef.current?.(next ? collectTerminals(next).length : 0);
    },
    [cancelDeferredPersist, persist],
  );

  // Each call registers a cleanup in pendingInjectCleanups so the unmount
  // effect can tear down in-flight injections — otherwise the pty-output
  // subscription would outlive the component and fire into a dead session.
  const scheduleCmdInject = useCallback((id: string, cmd: string) => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let fired = false;

    const unsubscribe = EventsOn(`pty-output-${id}`, () => {
      if (fired) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(fire, PROMPT_IDLE_MS);
    });

    const cleanup = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      unsubscribe();
      pendingInjectCleanups.current.delete(cleanup);
    };

    function fire() {
      if (fired) return;
      fired = true;
      cleanup();
      sendTerminalInput(id, cmd + "\n").catch(() => {});
    }

    fallbackTimer = setTimeout(fire, PROMPT_MAX_WAIT_MS);
    pendingInjectCleanups.current.add(cleanup);
  }, []);

  // Restore saved tree on mount. Each leaf's terminals get re-launched
  // with fresh PTY ids; restore commands are re-injected (resumeCmd takes
  // precedence so programs with session resume land back in their
  // previous conversation instead of restarting fresh). Falls back to
  // converting the legacy terminals[] array into a single root pane.
  useEffect(() => {
    const saved = getProjectTerminals(projectName);
    const persistedTree = saved.panes ?? legacyEntriesToTree(saved.terminals);
    if (!persistedTree) return;

    // Pane ids are regenerated on reify, so we look the previously focused
    // pane up by its position in the tree and map it to its new id.
    const savedFocusedPath = saved.focusedPanePath;
    let cancelled = false;
    const allStartedIds: string[] = [];

    (async () => {
      const restored = await reifyTreeWithFreshPtys(persistedTree, projectName, allStartedIds);
      if (cancelled || !restored) {
        allStartedIds.forEach((id) => StopTerminal(id).catch(() => {}));
        return;
      }
      setTree(restored);
      const savedFocusedLeaf = savedFocusedPath
        ? paneAtPath(restored, savedFocusedPath)
        : null;
      setFocusedPaneId(savedFocusedLeaf?.id ?? firstPaneId(restored));
      const all = collectTerminals(restored);
      onCountRef.current?.(all.length);
      all.forEach((t) => {
        const cmd = t.resumeCmd ?? t.startCmd;
        if (cmd) scheduleCmdInject(t.id, cmd);
      });
    })();

    return () => {
      cancelled = true;
      allStartedIds.forEach((id) => StopTerminal(id).catch(() => {}));
    };
  }, [projectName, scheduleCmdInject]);

  // Central path for adding a terminal: either to an explicit pane, the
  // focused pane, or a fresh root pane if the tree is empty.
  const addTerminal = useCallback(
    (term: TerminalInstance, targetPaneId?: string) => {
      const current = treeRef.current;
      if (!current) {
        const paneId = targetPaneId ?? nextPaneId();
        applyTree(makePaneLeaf(paneId, [term], 0), paneId);
        return;
      }
      const paneId = targetPaneId ?? focusedRef.current ?? firstPaneId(current);
      applyTree(mapPane(current, paneId, (p) => appendTerminal(p, term)), paneId);
    },
    [applyTree],
  );

  const createTerminal = useCallback(async () => {
    try {
      const id = await StartTerminal(projectName);
      addTerminal(makeTerminal(id, pickTerminalLabel(treeRef.current)));
    } catch {}
  }, [projectName, addTerminal]);

  const createTerminalWithCmd = useCallback(
    async (label: string, cmd: string, opts?: TerminalStartOpts) => {
      // When reuse is requested, find an existing terminal tagged with the
      // same actionName. If found, focus it and re-send the command instead
      // of spawning a new PTY.
      if (opts?.actionName && treeRef.current) {
        let found: { paneId: string; tabIdx: number; termId: string } | null = null;
        walkPanes(treeRef.current, (pane) => {
          if (found) return;
          const idx = pane.tabs.findIndex((t) => t.actionName === opts.actionName);
          if (idx !== -1) found = { paneId: pane.id, tabIdx: idx, termId: pane.tabs[idx].id };
        });
        if (found) {
          const { paneId, tabIdx, termId } = found;
          const next = mapPane(treeRef.current, paneId, (p) => ({
            ...p,
            activeTabIdx: tabIdx,
            activeServiceName: undefined,
          }));
          applyTree(next, paneId);
          await sendTerminalInput(termId, cmd + "\n");
          return;
        }
      }

      // Named configs go through the restore-aware RPC: the Go side owns
      // the session-id rewrite so launch.startCmd is authoritative, and a
      // non-empty resumeCmd is the signal that this terminal opted into
      // restore and both cmds should be persisted.
      if (opts?.configName) {
        const launch = await StartTerminalForConfig(projectName, opts.configName);
        const term = launch.resumeCmd
          ? makeTerminal(launch.id, label, launch.startCmd, launch.resumeCmd)
          : makeTerminal(launch.id, label);
        addTerminal(term);
        scheduleCmdInject(launch.id, launch.startCmd);
        return;
      }

      // Ad-hoc command terminals (e.g. action-as-terminal invocations) are
      // ephemeral — the command is typed once but not persisted.
      const id = (opts?.cwd || opts?.env)
        ? await StartTerminalWithCwdEnv(projectName, opts.cwd ?? "", opts.env ?? {})
        : await StartTerminal(projectName);
      addTerminal(makeTerminal(id, label, undefined, undefined, opts?.actionName));
      scheduleCmdInject(id, cmd);
    },
    [projectName, addTerminal, applyTree, scheduleCmdInject],
  );

  const addTerminalToPane = useCallback(
    async (paneId: string) => {
      try {
        const id = await StartTerminal(projectName);
        addTerminal(makeTerminal(id, pickTerminalLabel(treeRef.current)), paneId);
      } catch {}
    },
    [projectName, addTerminal],
  );

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

  const closeTerminal = useCallback(
    (paneId: string, tabIdx: number) => {
      const current = treeRef.current;
      if (!current) return;
      const pane = findPane(current, paneId);
      if (!pane || !pane.tabs[tabIdx]) return;
      StopTerminal(pane.tabs[tabIdx].id).catch(() => {});

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
    [applyTree, collapsePane],
  );

  const focusTerminal = useCallback(
    (paneId: string, tabIdx: number) => {
      const current = treeRef.current;
      if (!current) return;
      const pane = findPane(current, paneId);
      if (!pane) return;
      if (pane.activeTabIdx === tabIdx && pane.activeServiceName === undefined) return;
      const next = mapPane(current, paneId, (p) => ({
        ...p,
        activeTabIdx: tabIdx,
        activeServiceName: undefined,
      }));
      applyTree(next, paneId);
    },
    [applyTree],
  );

  const focusService = useCallback(
    (paneId: string, serviceName: string) => {
      const current = treeRef.current;
      if (!current) return;
      const pane = findPane(current, paneId);
      if (!pane || pane.activeServiceName === serviceName) return;
      const next = mapPane(current, paneId, (p) => ({ ...p, activeServiceName: serviceName }));
      applyTree(next, paneId);
    },
    [applyTree],
  );

  const ensureRootPane = useCallback(
    (initialServiceName?: string) => {
      if (treeRef.current) return;
      const paneId = nextPaneId();
      const pane = makePaneLeaf(paneId, [], 0);
      if (initialServiceName) pane.activeServiceName = initialServiceName;
      applyTree(pane, paneId);
    },
    [applyTree],
  );

  const renameTerminal = useCallback(
    (paneId: string, tabIdx: number, label: string) => {
      const current = treeRef.current;
      if (!current) return;
      const next = mapPane(current, paneId, (p) => ({
        ...p,
        tabs: p.tabs.map((t, i) => (i === tabIdx ? { ...t, label } : t)),
      }));
      applyTree(next);
    },
    [applyTree],
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

      const next = mapPane(current, paneId, (p) => ({
        ...p,
        tabs: newTabs,
        activeTabIdx: newActive,
      }));
      applyTree(next);
    },
    [applyTree],
  );

  const splitPane = useCallback(
    async (paneId: string, direction: SplitDirection) => {
      if (!treeRef.current || !findPane(treeRef.current, paneId)) return;
      let newId: string;
      try {
        newId = await StartTerminal(projectName);
      } catch {
        return;
      }
      // Re-verify the pane still exists after the async PTY start — if the
      // user closed it in the meantime, drop the new PTY to avoid leaking.
      const current = treeRef.current;
      if (!current || !findPane(current, paneId)) {
        StopTerminal(newId).catch(() => {});
        return;
      }
      const newPaneId = nextPaneId();
      const newPane = makePaneLeaf(newPaneId, [makeTerminal(newId, pickTerminalLabel(current))], 0);
      applyTree(splitAtPane(current, paneId, direction, newPane), newPaneId);
    },
    [projectName, applyTree],
  );

  const closePane = useCallback(
    (paneId: string) => {
      const current = treeRef.current;
      if (!current) return;
      const pane = findPane(current, paneId);
      if (!pane) return;
      pane.tabs.forEach((t) => StopTerminal(t.id).catch(() => {}));
      collapsePane(current, paneId);
    },
    [collapsePane],
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
      schedulePersist();
    },
    [schedulePersist],
  );

  const focusPane = useCallback(
    (paneId: string) => {
      if (focusedRef.current === paneId) return;
      const current = treeRef.current;
      if (!current || !findPane(current, paneId)) return;
      setFocusedPaneId(paneId);
      // Sync ref so the debounced persist reads the just-clicked pane id.
      focusedRef.current = paneId;
      schedulePersist();
    },
    [schedulePersist],
  );

  const getFocusedPane = useCallback((): PaneLeaf | null => {
    const t = treeRef.current;
    const f = focusedRef.current;
    return t && f ? findPane(t, f) : null;
  }, []);

  const getPane = useCallback((paneId: string): PaneLeaf | null => {
    return treeRef.current ? findPane(treeRef.current, paneId) : null;
  }, []);

  // Cleanup all terminals and pending command injections on unmount.
  // Flush any debounced persist first so in-flight ratio changes aren't
  // lost.
  useEffect(() => {
    const cleanups = pendingInjectCleanups.current;
    return () => {
      if (deferredPersistTimer.current) {
        clearTimeout(deferredPersistTimer.current);
        deferredPersistTimer.current = null;
        persist(treeRef.current);
      }
      cleanups.forEach((fn) => fn());
      cleanups.clear();
      const current = treeRef.current;
      if (current) {
        collectTerminals(current).forEach((t) => {
          StopTerminal(t.id).catch(() => {});
        });
      }
    };
  }, [persist]);

  return {
    tree,
    focusedPaneId,
    createTerminal,
    createTerminalWithCmd,
    addTerminalToPane,
    closeTerminal,
    focusTerminal,
    focusService,
    renameTerminal,
    reorderTerminals,
    splitPane,
    closePane,
    setRatio,
    focusPane,
    ensureRootPane,
    getFocusedPane,
    getPane,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveActiveAfterClose(prevActive: number, removed: number, remaining: number): number {
  if (remaining === 0) return 0;
  if (prevActive === removed) return Math.min(removed, remaining - 1);
  if (prevActive > removed) return prevActive - 1;
  return prevActive;
}

function clampIdx(idx: number | undefined, length: number): number {
  if (typeof idx !== "number" || length === 0) return 0;
  return Math.max(0, Math.min(idx, length - 1));
}

/**
 * Walks a persisted tree and launches a fresh PTY for each terminal in
 * every leaf pane. Tabs within a pane are started in parallel; split
 * subtrees (`a` and `b`) are also reified in parallel. On any failure
 * partway through, the caller is responsible for stopping PTYs launched
 * so far via `startedIds`.
 */
async function reifyTreeWithFreshPtys(
  node: PersistedPaneNode,
  projectName: string,
  startedIds: string[],
): Promise<PaneNode | null> {
  if (node.kind === "leaf") {
    const persistedTabs = node.tabs ?? [];
    // A service-only pane (no interactive terminals, just an active service
    // tab) is allowed. A truly empty pane is dropped.
    if (persistedTabs.length === 0 && !node.activeServiceName) return null;
    try {
      const ids = await Promise.all(persistedTabs.map(() => StartTerminal(projectName)));
      ids.forEach((id) => startedIds.push(id));
      const tabs = ids.map((id, i) =>
        makeTerminal(id, persistedTabs[i].label ?? "Terminal", persistedTabs[i].startCmd, persistedTabs[i].resumeCmd, persistedTabs[i].actionName),
      );
      const pane = makePaneLeaf(nextPaneId(), tabs, clampIdx(node.activeTabIdx, tabs.length));
      if (node.activeServiceName) pane.activeServiceName = node.activeServiceName;
      return pane;
    } catch {
      return null;
    }
  }
  if (!node.a || !node.b) return null;
  const [a, b] = await Promise.all([
    reifyTreeWithFreshPtys(node.a, projectName, startedIds),
    reifyTreeWithFreshPtys(node.b, projectName, startedIds),
  ]);
  if (!a || !b) return null;
  return {
    kind: "split",
    direction: node.direction === "col" ? "col" : "row",
    ratio: typeof node.ratio === "number" ? node.ratio : 0.5,
    a,
    b,
  };
}

/**
 * Strips live PTY ids before persisting — ids won't be valid after a
 * restart, so we zero them. label/startCmd/resumeCmd are kept so restore
 * can re-inject them.
 */
function treeToPersisted(node: PaneNode): PersistedPaneNode {
  if (node.kind === "leaf") {
    return {
      kind: "leaf",
      activeTabIdx: node.activeTabIdx,
      ...(node.activeServiceName ? { activeServiceName: node.activeServiceName } : {}),
      tabs: node.tabs.map((t) => ({
        label: t.label,
        ...(t.startCmd ? { startCmd: t.startCmd } : {}),
        ...(t.resumeCmd ? { resumeCmd: t.resumeCmd } : {}),
        ...(t.actionName ? { actionName: t.actionName } : {}),
      })),
    };
  }
  return {
    kind: "split",
    direction: node.direction,
    ratio: node.ratio,
    a: treeToPersisted(node.a),
    b: treeToPersisted(node.b),
  };
}

/**
 * Upgrades the legacy terminals[] array (no tree) into a single root pane
 * containing all saved entries as tabs.
 */
function legacyEntriesToTree(entries: PersistedTerminalEntry[] | undefined): PersistedPaneNode | null {
  if (!entries || entries.length === 0) return null;
  return {
    kind: "leaf",
    activeTabIdx: 0,
    tabs: entries.map((e) => ({
      label: e.label,
      ...(e.startCmd ? { startCmd: e.startCmd } : {}),
      ...(e.resumeCmd ? { resumeCmd: e.resumeCmd } : {}),
    })),
  };
}
