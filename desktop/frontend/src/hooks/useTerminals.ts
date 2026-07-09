import { useState, useEffect, useRef, useCallback } from "react";
import { StartTerminal, StartTerminalForConfig, StartTerminalForRestore, StartTerminalWithCwdEnv, StopTerminal, ClearPaneStatus } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import { sendTerminalInput, shellQuote } from "../terminal-io";
import { detectAICLI } from "../slashCommands";
import { isInteractivePaneSessionDead } from "../components/InteractivePane";
import {
  appendHistoryEntry,
  getProjectTerminals,
  removeHistoryEntry,
  saveProjectTerminals,
  updateProjectTerminalsCache,
  type PersistedHistoryEntry,
  type PersistedPaneNode,
  type PersistedTerminalEntry,
} from "../terminals";
import {
  type PaneNode,
  type PaneLeaf,
  type SplitDirection,
  type TerminalInstance,
  makePaneLeaf,
  makeTerminal,
  makeBrowser,
  makeReview,
  isTerminalTab,
  adjacentPaneHeaderItem,
  clampIdx,
  collectPanes,
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
  isTabPinned,
} from "../paneTree";
import { useTabScroll } from "../store/tabScroll";
import { useAppStore } from "../store/app";
import { disambiguateLabel, pickTerminalLabel } from "../terminalLabels";
import {
  IS_MIRROR_WINDOW,
  broadcastMirrorTree,
  onMirrorTree,
  onMirrorTreeRequest,
  requestMirrorTree,
  requestMirrorAction,
  onMirrorAction,
} from "../mirror";

export interface TerminalStartOpts {
  configName?: string;
  cwd?: string;
  env?: Record<string, string>;
  actionName?: string;
  reuse?: boolean;
  emoji?: string;
  // Submitted into the terminal after `cmd`, once the launched program goes
  // quiet — e.g. an initial task for an AI agent started by `cmd`. A string is
  // a text prompt; an array is ordered paste parts (text runs and image paths).
  prompt?: string | string[];
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
  resumeFromHistory: (entry: PersistedHistoryEntry) => Promise<void>;
  addTerminalToPane: (paneId: string) => Promise<void>;
  addBrowserToPane: (paneId?: string) => void;
  addReviewToPane: (paneId?: string) => void;
  closeTerminal: (paneId: string, tabIdx: number) => void;
  closeOtherTerminals: (paneId: string, tabIdx: number) => void;
  focusTerminal: (paneId: string, tabIdx: number) => void;
  focusAdjacentPaneItem: (paneId: string, delta: 1 | -1, serviceNames: string[]) => void;
  focusService: (paneId: string, serviceName: string) => void;
  renameTerminal: (
    paneId: string,
    tabIdx: number,
    label: string,
    emoji?: string,
  ) => void;
  toggleTabPinned: (paneId: string, tabIdx: number) => void;
  reorderTerminals: (paneId: string, order: string[]) => void;
  remoteCloseTerminal: (termId: string) => void;
  remoteRenameTerminal: (termId: string, label: string) => void;
  remoteTogglePin: (termId: string) => void;
  remoteReorderTerminals: (order: string[]) => void;
  moveTerminal: (fromPaneId: string, termId: string, toPaneId: string, toIdx?: number) => void;
  splitPane: (paneId: string, direction: SplitDirection) => Promise<void>;
  closePane: (paneId: string) => void;
  setRatio: (path: number[], ratio: number) => void;
  focusPane: (paneId: string) => void;
  ensureRootPane: (initialServiceName?: string) => void;
  getFocusedPane: () => PaneLeaf | null;
  getPane: (paneId: string) => PaneLeaf | null;
}

// Client-side id for panes + browser webview labels (terminal ids come from the backend).
function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function appendTerminal(pane: PaneLeaf, term: TerminalInstance): PaneLeaf {
  return {
    ...pane,
    tabs: [...pane.tabs, term],
    activeTabIdx: pane.tabs.length,
    activeServiceName: undefined,
  };
}

// Seed a launched agent with its initial task the same way the generator flow
// does: fold a text prompt into the launch command as a positional argument
// (e.g. `claude '<task>'`) so the CLI submits it once it's ready. Typing it into
// the TUI after launch is unreliable — agents boot through async phases (MCP
// load, auth checks) whose pauses fool idle detection into firing mid-boot, so
// the submit is swallowed and the prompt sits unsent. Only plain-text prompts
// fold; an image prompt stays an array so it can be delivered as an isolated
// bracketed paste (the only reliable way to attach a file), and a non-agent
// command is left untouched.
function foldAgentPrompt(
  cmd: string,
  prompt?: string | string[],
): { cmd: string; prompt?: string | string[] } {
  if (typeof prompt === "string" && prompt.trim() && detectAICLI(cmd)) {
    return { cmd: `${cmd} ${shellQuote(prompt.trim())}`, prompt: undefined };
  }
  return { cmd, prompt };
}

export function useTerminals(
  projectName: string,
  onTerminalCountChange?: (count: number) => void,
  submitPrompt?: (id: string, payload: string | string[]) => boolean,
): UseTerminalsResult {
  const [tree, setTree] = useState<PaneNode | null>(null);
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);

  const treeRef = useRef(tree);
  treeRef.current = tree;
  const focusedRef = useRef(focusedPaneId);
  focusedRef.current = focusedPaneId;
  const onCountRef = useRef(onTerminalCountChange);
  onCountRef.current = onTerminalCountChange;
  const submitPromptRef = useRef(submitPrompt);
  submitPromptRef.current = submitPrompt;

  const pendingInjectCleanups = useRef<Set<() => void>>(new Set());
  const deferredPersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mirrorActiveRef = useRef(false);
  const broadcastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ratioForwardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Settles when the mount restore is done (tree applied, or nothing to
  // restore). Terminal creation awaits this: a create that races the restore —
  // e.g. a mobile "new terminal" request that just mounted this project — would
  // otherwise land first and be wiped by the restore's setTree.
  const restoreSettled = useRef<Promise<void>>(Promise.resolve());

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

  const persist = useCallback(
    (next: PaneNode | null) => {
      // A mirror window never owns the persisted tree — the owner (main
      // window) is the single source of truth for terminals.json.
      if (IS_MIRROR_WINDOW) return;
      const focusedId = focusedRef.current;
      // serviceFilterModes is a removed field (filter mode is now a single
      // global setting); strip it so a dead key from an earlier build doesn't
      // round-trip back into terminals.json.
      const { serviceFilterModes: _legacy, ...state } = getProjectTerminals(
        projectName,
      ) as ReturnType<typeof getProjectTerminals> & {
        serviceFilterModes?: unknown;
      };
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

  // Run `action` once the pty goes quiet (or PROMPT_MAX_WAIT_MS elapses). Each
  // call registers a cleanup in pendingInjectCleanups so the unmount effect can
  // tear down in-flight injections — otherwise the pty-output subscription would
  // outlive the component and fire into a dead session.
  const runWhenIdle = useCallback((id: string, action: () => void) => {
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
      action();
    }

    fallbackTimer = setTimeout(fire, PROMPT_MAX_WAIT_MS);
    pendingInjectCleanups.current.add(cleanup);
  }, []);

  // Type `text` + newline once the shell prompt settles, then run `onSent`.
  const scheduleInputInject = useCallback(
    (id: string, text: string, onSent?: () => void) => {
      runWhenIdle(id, () => {
        sendTerminalInput(id, text + "\n").catch(() => {});
        onSent?.();
      });
    },
    [runWhenIdle],
  );

  // Submit an optional follow-up prompt — e.g. a task for an AI agent — once the
  // launched program has drawn its own input UI. Waits for the pty to go quiet
  // so we never type before the receiver is ready, then delivers through the
  // terminal handle's submitInput: a bracketed paste whose submitting CR is
  // gated on the program's paste/image redraw settling. A naive "text + newline"
  // write submits an LF (not the CR agents read as Enter) in one shot, so an
  // agent like Claude Code swallows it mid-redraw and the prompt sits unsent. A
  // blank prompt is a no-op; the handle path falls back to a raw CR write only
  // if no live handle is registered.
  const scheduleSeedInject = useCallback(
    (id: string, prompt?: string | string[]) => {
      let payload: string | string[] | undefined;
      if (typeof prompt === "string") payload = prompt.trim() || undefined;
      else if (Array.isArray(prompt)) {
        const parts = prompt.filter((p) => p.trim().length > 0);
        payload = parts.length ? parts : undefined;
      }
      if (payload === undefined) return;
      runWhenIdle(id, () => {
        const submitted = submitPromptRef.current?.(id, payload) ?? false;
        if (!submitted) {
          const flat = Array.isArray(payload) ? payload.join("") : payload;
          sendTerminalInput(id, `${flat}\r`).catch(() => {});
        }
      });
    },
    [runWhenIdle],
  );

  // Type the launch command once the shell prompt settles, then seed the
  // optional follow-up prompt once the launched program is ready.
  const scheduleCmdInject = useCallback(
    (id: string, cmd: string, prompt?: string | string[]) => {
      scheduleInputInject(id, cmd, () => scheduleSeedInject(id, prompt));
    },
    [scheduleInputInject, scheduleSeedInject],
  );

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

  // Owner side of the mirror channel: answer a mirror window's request for the
  // current live tree, and lazily arm change-broadcasting (only once a mirror
  // has actually asked, so non-mirrored projects stay silent).
  useEffect(() => {
    if (IS_MIRROR_WINDOW) return;
    return onMirrorTreeRequest(projectName, () => {
      mirrorActiveRef.current = true;
      broadcastMirrorTree(projectName, {
        tree: treeRef.current,
        focusedPaneId: focusedRef.current,
      });
    });
  }, [projectName]);

  // Disarm broadcasting once the project is no longer detached (mirror window
  // closed / re-attached). Otherwise mirrorActiveRef stays latched for the rest
  // of the session and every tree/focus change keeps serializing + emitting the
  // pane tree over IPC to a listener that no longer exists.
  const isDetached = useAppStore((s) => s.detached.has(projectName));
  useEffect(() => {
    if (IS_MIRROR_WINDOW) return;
    if (!isDetached) mirrorActiveRef.current = false;
  }, [isDetached]);

  // Re-broadcast the live tree whenever it changes so the mirror follows adds,
  // closes, splits, tab switches, and divider drags. Debounced so a divider
  // drag coalesces to ~one emit per frame-burst.
  useEffect(() => {
    if (IS_MIRROR_WINDOW || !mirrorActiveRef.current) return;
    if (broadcastTimer.current) clearTimeout(broadcastTimer.current);
    broadcastTimer.current = setTimeout(() => {
      broadcastMirrorTree(projectName, {
        tree: treeRef.current,
        focusedPaneId: focusedRef.current,
      });
    }, 80);
    return () => {
      if (broadcastTimer.current) clearTimeout(broadcastTimer.current);
    };
  }, [projectName, tree, focusedPaneId]);

  // Central path for adding a terminal: either to an explicit pane, the
  // focused pane, or a fresh root pane if the tree is empty.
  const addTerminal = useCallback(
    (term: TerminalInstance, targetPaneId?: string) => {
      const current = treeRef.current;
      // Suffix duplicate PTY-tab labels ("Ultracode 2", "Ultracode 3") at the
      // one path every add funnels through, so no caller can reintroduce a
      // collision. Generic "Terminal N" labels are already unique (no-op);
      // browser/review tabs keep their bare shared names.
      const labeled = isTerminalTab(term)
        ? { ...term, label: disambiguateLabel(current, term.label) }
        : term;
      if (!current) {
        const paneId = targetPaneId ?? nextId("pane");
        applyTree(makePaneLeaf(paneId, [labeled], 0), paneId);
        return;
      }
      const paneId = targetPaneId ?? focusedRef.current ?? firstPaneId(current);
      applyTree(mapPane(current, paneId, (p) => appendTerminal(p, labeled)), paneId);
    },
    [applyTree],
  );

  const createTerminal = useCallback(async () => {
    if (IS_MIRROR_WINDOW) return forward("createTerminal");
    await restoreSettled.current;
    try {
      const id = await StartTerminal(projectName);
      addTerminal(makeTerminal(id, pickTerminalLabel(treeRef.current)));
    } catch {}
  }, [projectName, addTerminal, forward]);

  const createTerminalWithCmd = useCallback(
    async (label: string, cmd: string, opts?: TerminalStartOpts) => {
      if (IS_MIRROR_WINDOW) return forward("createTerminalWithCmd", label, cmd, opts);
      await restoreSettled.current;
      // When reuse is requested, find an existing live terminal tagged with
      // the same actionName. A dead session (process exited) falls through
      // so the user gets a fresh PTY instead of typing into a dead tab.
      if (opts?.reuse && opts?.actionName && treeRef.current) {
        for (const pane of collectPanes(treeRef.current)) {
          const idx = pane.tabs.findIndex(
            (t) =>
              t.actionName === opts.actionName &&
              !isInteractivePaneSessionDead(t.id),
          );
          if (idx !== -1) {
            if (pane.activeTabIdx !== idx || pane.activeServiceName !== undefined) {
              applyTree(mapPane(treeRef.current, pane.id, (p) => ({
                ...p,
                activeTabIdx: idx,
                activeServiceName: undefined,
              })), pane.id);
            }
            // Always bring the reused tab into view: when it's already active no
            // pane state changes, so PaneView's activation effect wouldn't fire.
            useTabScroll.getState().requestScroll(pane.id);
            const reused = foldAgentPrompt(cmd, opts.prompt);
            await sendTerminalInput(pane.tabs[idx].id, reused.cmd + "\n");
            scheduleSeedInject(pane.tabs[idx].id, reused.prompt);
            return;
          }
        }
      }

      // Named configs go through the restore-aware RPC: the Go side owns
      // the session-id rewrite so launch.startCmd is authoritative, and a
      // non-empty resumeCmd is the signal that this terminal opted into
      // restore and both cmds should be persisted.
      if (opts?.configName) {
        const launch = await StartTerminalForConfig(projectName, opts.configName);
        const term = makeTerminal(launch.id, label, {
          ...(launch.resumeCmd && { startCmd: launch.startCmd, resumeCmd: launch.resumeCmd }),
          actionName: opts.actionName,
          emoji: opts.emoji,
        });
        addTerminal(term);
        if (launch.startCmd) {
          // Fold into the injected command only; `term` persists the original
          // startCmd so a later restore relaunches without re-seeding the task.
          const folded = foldAgentPrompt(launch.startCmd, opts.prompt);
          scheduleCmdInject(launch.id, folded.cmd, folded.prompt);
        } else {
          scheduleSeedInject(launch.id, opts.prompt);
        }
        return;
      }

      // Ad-hoc command terminals (e.g. action-as-terminal invocations) are
      // ephemeral — the command is typed once but not persisted.
      const id = (opts?.cwd || opts?.env)
        ? await StartTerminalWithCwdEnv(projectName, opts.cwd ?? "", opts.env ?? {})
        : await StartTerminal(projectName);
      addTerminal(
        makeTerminal(id, label, {
          actionName: opts?.actionName,
          emoji: opts?.emoji,
        }),
      );
      const folded = foldAgentPrompt(cmd, opts?.prompt);
      scheduleCmdInject(id, folded.cmd, folded.prompt);
    },
    [projectName, addTerminal, applyTree, scheduleCmdInject, scheduleSeedInject, forward],
  );

  const resumeFromHistory = useCallback(
    async (entry: PersistedHistoryEntry) => {
      if (IS_MIRROR_WINDOW) return forward("resumeFromHistory", entry);
      let id: string;
      try {
        id = entry.actionName
          ? await StartTerminalForRestore(projectName, entry.actionName)
          : await StartTerminal(projectName);
      } catch {
        return;
      }
      const stateAfterRemove = removeHistoryEntry(
        getProjectTerminals(projectName),
        entry.resumeCmd,
      );
      updateProjectTerminalsCache(projectName, stateAfterRemove);
      const term = makeTerminal(id, entry.label, {
        startCmd: entry.startCmd,
        resumeCmd: entry.resumeCmd,
        actionName: entry.actionName,
      });
      addTerminal(term);
      scheduleCmdInject(id, entry.resumeCmd);
    },
    [projectName, addTerminal, scheduleCmdInject, forward],
  );

  const addTerminalToPane = useCallback(
    async (paneId: string) => {
      if (IS_MIRROR_WINDOW) return forward("addTerminalToPane", paneId);
      try {
        const id = await StartTerminal(projectName);
        addTerminal(makeTerminal(id, pickTerminalLabel(treeRef.current)), paneId);
      } catch {}
    },
    [projectName, addTerminal, forward],
  );

  // Browser tabs have no PTY — no StartTerminal, just a webview keyed by id.
  // Still owner-created so the tab id is minted once, in the tree of record.
  const addBrowserToPane = useCallback(
    (paneId?: string) => {
      if (IS_MIRROR_WINDOW) return forward("addBrowserToPane", paneId);
      addTerminal(makeBrowser(nextId("browser")), paneId);
    },
    [addTerminal, forward],
  );

  // Review tabs have no PTY — they render the git diff review pane keyed by id.
  const addReviewToPane = useCallback(
    (paneId?: string) => {
      if (IS_MIRROR_WINDOW) return forward("addReviewToPane", paneId);
      addTerminal(makeReview(nextId("review")), paneId);
    },
    [addTerminal, forward],
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
    (tabs: TerminalInstance[]) => {
      for (const t of tabs) {
        StopTerminal(t.id).catch(() => {});
        if (isTerminalTab(t)) {
          ClearPaneStatus(projectName, t.id).catch(() => {});
        }
      }
      recordClosingTabs(tabs);
    },
    [recordClosingTabs, projectName],
  );

  const closeTerminal = useCallback(
    (paneId: string, tabIdx: number) => {
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
      if (isTabPinned(pane, tabIdx)) return;
      disposeTabs([pane.tabs[tabIdx]]);

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
    [applyTree, collapsePane, disposeTabs, forward],
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
    (initialServiceName?: string) => {
      if (treeRef.current) return;
      // Owner-only: the pane id must be minted once, in the tree of record.
      if (IS_MIRROR_WINDOW) return forward("ensureRootPane", initialServiceName);
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
        tabs: p.tabs.map((t, i) =>
          i === tabIdx
            ? {
                ...t,
                label,
                // undefined emoji => caller isn't editing it; "" clears it.
                ...(emoji !== undefined ? { emoji: emoji || undefined } : {}),
              }
            : t,
        ),
      }));
      applyTree(next);
    },
    [applyTree, forward],
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
    },
    [applyTree, forward],
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
    },
    [applyTree, forward],
  );

  // Collapses the source pane when the move empties it, matching the
  // closeTerminal rule — panes with a persistent service tab stay alive.
  const moveTerminal = useCallback(
    (fromPaneId: string, termId: string, toPaneId: string, toIdx?: number) => {
      if (fromPaneId === toPaneId) return;
      if (IS_MIRROR_WINDOW) forward("moveTerminal", fromPaneId, termId, toPaneId, toIdx);
      const current = treeRef.current;
      if (!current) return;
      const fromPane = findPane(current, fromPaneId);
      const toPane = findPane(current, toPaneId);
      if (!fromPane || !toPane) return;
      const fromIdx = fromPane.tabs.findIndex((t) => t.id === termId);
      if (fromIdx < 0) return;
      const term = fromPane.tabs[fromIdx];

      let next: PaneNode | null = mapPane(current, fromPaneId, (p) => {
        const tabs = p.tabs.filter((_, i) => i !== fromIdx);
        return {
          ...p,
          tabs,
          activeTabIdx: resolveActiveAfterClose(p.activeTabIdx, fromIdx, tabs.length),
        };
      });

      const updatedFrom = findPane(next, fromPaneId);
      if (updatedFrom && updatedFrom.tabs.length === 0 && !updatedFrom.activeServiceName) {
        next = removePane(next, fromPaneId);
      }
      if (!next) return;

      next = mapPane(next, toPaneId, (p) => {
        const insertAt =
          toIdx === undefined ? p.tabs.length : Math.max(0, Math.min(toIdx, p.tabs.length));
        const tabs = [...p.tabs.slice(0, insertAt), term, ...p.tabs.slice(insertAt)];
        return { ...p, tabs, activeTabIdx: insertAt, activeServiceName: undefined };
      });

      applyTree(next, toPaneId);
    },
    [applyTree, forward],
  );

  const splitPane = useCallback(
    async (paneId: string, direction: SplitDirection) => {
      if (IS_MIRROR_WINDOW) return forward("splitPane", paneId, direction);
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
      const newPaneId = nextId("pane");
      const newPane = makePaneLeaf(newPaneId, [makeTerminal(newId, pickTerminalLabel(current))], 0);
      applyTree(splitAtPane(current, paneId, direction, newPane), newPaneId);
    },
    [projectName, applyTree, forward],
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

  // Pane-agnostic id resolvers for callers (the mobile relay) that only know a
  // terminal's id, not which pane holds it: walk the tree to locate the tab,
  // then run the normal index-based handler. A missing id is a safe no-op.
  const locateTerminal = useCallback((termId: string) => {
    const current = treeRef.current;
    if (!current) return null;
    for (const pane of collectPanes(current)) {
      const idx = pane.tabs.findIndex((t) => t.id === termId);
      if (idx >= 0) return { paneId: pane.id, idx };
    }
    return null;
  }, []);
  const remoteCloseTerminal = useCallback(
    (termId: string) => {
      const hit = locateTerminal(termId);
      if (hit) closeTerminal(hit.paneId, hit.idx);
    },
    [locateTerminal, closeTerminal],
  );
  const remoteRenameTerminal = useCallback(
    (termId: string, label: string) => {
      const hit = locateTerminal(termId);
      if (hit && label.trim()) renameTerminal(hit.paneId, hit.idx, label.trim());
    },
    [locateTerminal, renameTerminal],
  );
  const remoteTogglePin = useCallback(
    (termId: string) => {
      const hit = locateTerminal(termId);
      if (hit) toggleTabPinned(hit.paneId, hit.idx);
    },
    [locateTerminal, toggleTabPinned],
  );
  // The phone shows a flat list across all panes and sends the full new id order.
  // Reorder each pane by its terminals' relative order in that list (a terminal
  // stays in its own pane; cross-pane moves aren't expressed by a flat reorder).
  const remoteReorderTerminals = useCallback(
    (order: string[]) => {
      const current = treeRef.current;
      if (!current) return;
      for (const pane of collectPanes(current)) {
        const paneIds = new Set(pane.tabs.map((t) => t.id));
        const paneOrder = order.filter((id) => paneIds.has(id));
        if (paneOrder.length === pane.tabs.length && paneOrder.length > 0) {
          reorderTerminals(pane.id, paneOrder);
        }
      }
    },
    [reorderTerminals],
  );

  // Owner side of action forwarding: execute the actions a mirror window sends
  // for this project against the authoritative tree. This map is the single
  // list of everything a mirror may do; the result flows back to the mirror
  // through the tree broadcast. Pane/tab ids in the args are valid here because
  // the mirror's tree is a verbatim copy of this window's.
  const forwardable = {
    createTerminal,
    createTerminalWithCmd,
    resumeFromHistory,
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
  const forwardableRef = useRef(forwardable);
  forwardableRef.current = forwardable;

  useEffect(() => {
    if (IS_MIRROR_WINDOW) return;
    return onMirrorAction(projectName, (kind, args) => {
      // A forwarded action is proof a mirror is attached: arm change
      // broadcasting even if the arm-on-request signal was missed (e.g. this
      // hook instance remounted after the mirror joined), so the action's
      // resulting tree change always makes it back to the mirror.
      mirrorActiveRef.current = true;
      const actions = forwardableRef.current;
      if (!Object.prototype.hasOwnProperty.call(actions, kind)) return;
      const fn = actions[kind as keyof typeof actions] as unknown as (
        ...a: unknown[]
      ) => unknown;
      void fn(...args);
    });
  }, [projectName]);

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
      if (ratioForwardTimer.current) {
        clearTimeout(ratioForwardTimer.current);
        ratioForwardTimer.current = null;
      }
      cleanups.forEach((fn) => fn());
      cleanups.clear();
      // A mirror window adopts the owner's PTYs; closing it must not stop them.
      if (IS_MIRROR_WINDOW) return;
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
    resumeFromHistory,
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

function resolveActiveAfterClose(prevActive: number, removed: number, remaining: number): number {
  if (remaining === 0) return 0;
  if (prevActive === removed) return Math.min(removed, remaining - 1);
  if (prevActive > removed) return prevActive - 1;
  return prevActive;
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
      const ids = await Promise.all(
        persistedTabs.map((t) =>
          t.actionName
            ? StartTerminalForRestore(projectName, t.actionName)
            : StartTerminal(projectName),
        ),
      );
      ids.forEach((id) => startedIds.push(id));
      const tabs = ids.map((id, i) =>
        makeTerminal(id, persistedTabs[i].label ?? "Terminal", {
          historyKey: persistedTabs[i].historyKey,
          startCmd: persistedTabs[i].startCmd,
          resumeCmd: persistedTabs[i].resumeCmd,
          actionName: persistedTabs[i].actionName,
          pinned: persistedTabs[i].pinned,
          emoji: persistedTabs[i].emoji,
        }),
      );
      const pane = makePaneLeaf(nextId("pane"), tabs, clampIdx(node.activeTabIdx, tabs.length));
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
      // Only terminal tabs persist; non-PTY tabs (browser webviews, review
      // diffs) are ephemeral and don't survive restart.
      tabs: node.tabs
        .filter(isTerminalTab)
        .map((t) => ({
          label: t.label,
          ...(t.historyKey ? { historyKey: t.historyKey } : {}),
          ...(t.startCmd ? { startCmd: t.startCmd } : {}),
          ...(t.resumeCmd ? { resumeCmd: t.resumeCmd } : {}),
          ...(t.actionName ? { actionName: t.actionName } : {}),
          ...(t.pinned ? { pinned: true } : {}),
          ...(t.emoji ? { emoji: t.emoji } : {}),
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
