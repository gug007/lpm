import { useState, useEffect, useMemo, useRef, useCallback, useImperativeHandle } from "react";
import { toast } from "sonner";
import { EventsOn } from "../../bridge/runtime";
import { GetServiceLogs, StartLogStreaming, StopLogStreaming, ClearStatus } from "../../bridge/commands";
import type { ITheme } from "@xterm/xterm";
import { disposePaneSession, type PaneHandle } from "./Pane";
import { disposeInteractivePaneSession, isInteractivePaneSessionDead, type InteractivePaneHandle } from "./InteractivePane";
import { collectTerminals, isTabPinned, isTerminalTab } from "../paneTree";
import { PaneLayout } from "./PaneLayout";
import { TerminalTabDnd } from "./TerminalTabDnd";
import type { ServiceTabInfo, StatusKind } from "./PaneView";
import { type TerminalThemeName, getTerminalThemeColors, terminalThemeCssVars } from "../terminal-themes";
import { ansiColors } from "./terminal-utils";
import { TerminalIcon } from "./icons";
import { useKeyboardShortcut, type KeyboardShortcut } from "../hooks/useKeyboardShortcut";
import { canonicalShortcut, parseShortcut } from "../shortcutParse";
import { resolveHotkey, type HotkeyId } from "../hotkeys";
import { useServicePorts } from "../hooks/useServicePorts";
import { useTerminals, type TerminalStartOpts } from "../hooks/useTerminals";
import { buildGeneratorRunCommand } from "../generatorRun";
import { type PersistedHistoryEntry } from "../terminals";
import { getSettings, saveSettings, useSettingsStore } from "../store/settings";
import { useAppStore } from "../store/app";
import { useComposerStore } from "../store/composer";
import { forgetComposerDraft } from "../store/composerDrafts";
import { useTTSHotkeys } from "../hooks/useTTSHotkeys";
import { TTSControls } from "./TTSControls";
import { joinAbs } from "../path";

interface TerminalViewProps {
  projectName: string;
  projectRoot: string;
  services: { name: string; cwd?: string }[];
  terminalTheme: TerminalThemeName;
  onTerminalCountChange?: (count: number) => void;
  fontSize: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  runningPaneIDs?: Set<string>;
  donePaneIDs?: Set<string>;
  waitingPaneIDs?: Set<string>;
  errorPaneIDs?: Set<string>;
  visible?: boolean;
  ref?: React.Ref<TerminalViewHandle>;
}

export interface TerminalViewHandle {
  createTerminal(): void;
  createTerminalWithCmd(label: string, cmd: string, opts?: TerminalStartOpts): void;
  resumeFromHistory(entry: PersistedHistoryEntry): void;
  // Submit a command into the focused pane's active terminal. Returns false
  // (with a toast) when no live terminal is focused.
  sendCommandToActive(cmd: string): boolean;
}

export function TerminalView({ projectName, projectRoot, services, terminalTheme, onTerminalCountChange, fontSize, onZoomIn, onZoomOut, runningPaneIDs, donePaneIDs, waitingPaneIDs, errorPaneIDs, visible = true, ref }: TerminalViewProps) {
  const [outputs, setOutputs] = useState<string[]>([]);
  const [fullscreenPaneId, setFullscreenPaneId] = useState<string | null>(null);
  const [searchPaneId, setSearchPaneId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState(false);
  const [matchCount, setMatchCount] = useState(0);

  const terminalHandles = useRef<Map<string, InteractivePaneHandle>>(new Map());
  const serviceHandles = useRef<Map<string, PaneHandle>>(new Map());
  const visibleRef = useRef(visible);
  // Skip the first visibility-effect run so we don't double-start log
  // streaming (the log-streaming setup effect already starts it on mount).
  const mountedRef = useRef(false);
  visibleRef.current = visible;

  const {
    tree,
    focusedPaneId,
    createTerminal,
    createTerminalWithCmd,
    resumeFromHistory,
    addTerminalToPane,
    addBrowserToPane,
    addReviewToPane,
    closeTerminal,
    focusTerminal,
    focusAdjacentPaneItem,
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
    getFocusedPane,
    getPane,
  } = useTerminals(projectName, onTerminalCountChange);

  const servicesKey = services.map((s) => s.name).join(",");
  const stableServices = useMemo(() => services, [servicesKey]);
  const servicePorts = useServicePorts(projectName, visible && services.length > 0, servicesKey);

  // Ensure a root pane exists whenever there's something to host — either
  // a running service (so its tab has somewhere to live) or after the
  // user clicks the empty-state button (which calls createTerminal).
  useEffect(() => {
    if (tree || stableServices.length === 0) return;
    ensureRootPane(stableServices[0]?.name);
  }, [tree, stableServices, ensureRootPane]);

  // Exit fullscreen if the fullscreened pane vanished (closed or collapsed).
  useEffect(() => {
    if (fullscreenPaneId && !getPane(fullscreenPaneId)) {
      setFullscreenPaneId(null);
    }
  }, [tree, fullscreenPaneId, getPane]);

  useEffect(() => {
    if (searchPaneId && !getPane(searchPaneId)) {
      setSearchPaneId(null);
    }
  }, [tree, searchPaneId, getPane]);

  const { containerStyle, xtermTheme } = useMemo(() => {
    const colors = getTerminalThemeColors(terminalTheme);
    if (!colors) return { containerStyle: undefined, xtermTheme: null };
    return {
      containerStyle: terminalThemeCssVars(colors) as React.CSSProperties,
      xtermTheme: {
        background: colors.bg,
        foreground: colors.fg,
        selectionBackground: colors.selection,
        cursor: colors.cursor,
        ...ansiColors,
      } as ITheme,
    };
  }, [terminalTheme]);

  const serviceTabInfos: ServiceTabInfo[] = useMemo(
    () =>
      stableServices.map((svc, idx) => ({
        name: svc.name,
        output: outputs[idx] ?? "",
        sessionKey: `${projectName}:${svc.name}`,
        cwd: projectRoot ? joinAbs(projectRoot, svc.cwd ?? "") : "",
        ports: servicePorts[svc.name] ?? [],
      })),
    [stableServices, outputs, projectName, projectRoot, servicePorts],
  );

  // Session keys for all service Panes owned by this TerminalView.
  // Tracked in a ref so cleanup effects can dispose xterm instances
  // without re-running on every services change.
  const serviceKeysRef = useRef<string[]>([]);

  useEffect(() => {
    const nextKeys = stableServices.map((svc) => `${projectName}:${svc.name}`);
    const nextSet = new Set(nextKeys);
    for (const oldKey of serviceKeysRef.current) {
      if (!nextSet.has(oldKey)) disposePaneSession(oldKey);
    }
    serviceKeysRef.current = nextKeys;
  }, [projectName, stableServices]);

  useEffect(() => {
    return () => {
      for (const key of serviceKeysRef.current) disposePaneSession(key);
      serviceKeysRef.current = [];
    };
  }, []);

  // Dispose cached xterm sessions for terminals that leave the tree, so
  // close-tab/close-pane doesn't leak the xterm buffer and PTY listeners.
  const interactiveKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const prev = interactiveKeysRef.current;
    const next = new Set<string>();
    // Walk once while also checking membership against prev, so that
    // drags (which produce a fresh tree reference every frame with an
    // unchanged id set) can short-circuit before touching the ref.
    let sameAsPrev = true;
    if (tree) {
      for (const t of collectTerminals(tree)) {
        next.add(t.id);
        if (sameAsPrev && !prev.has(t.id)) sameAsPrev = false;
      }
    }
    if (sameAsPrev && next.size === prev.size) return;
    for (const id of prev) {
      if (!next.has(id)) {
        disposeInteractivePaneSession(id);
        forgetComposerDraft(id);
      }
    }
    interactiveKeysRef.current = next;
  }, [tree]);

  // Project-wide terminal list ({id,label}) for the composer's "@" mention. The
  // tree gets a fresh reference every drag frame, which would churn each
  // composer's mention memos, so reuse the prior array while the id/label set is
  // unchanged. Non-PTY tabs (browser, review) have no xterm session, so they're
  // left out.
  const allTerminalsRef = useRef<{ id: string; label: string }[]>([]);
  const allTerminals = useMemo(() => {
    const next = tree
      ? collectTerminals(tree)
          .filter(isTerminalTab)
          .map((t) => ({ id: t.id, label: t.label }))
      : [];
    const prev = allTerminalsRef.current;
    if (prev.length === next.length && prev.every((p, i) => p.id === next[i].id && p.label === next[i].label)) {
      return prev;
    }
    allTerminalsRef.current = next;
    return next;
  }, [tree]);

  useEffect(() => {
    return () => {
      for (const id of interactiveKeysRef.current) {
        disposeInteractivePaneSession(id);
        forgetComposerDraft(id);
      }
      interactiveKeysRef.current.clear();
    };
  }, []);

  const registerTerminalHandle = useCallback((terminalId: string, handle: InteractivePaneHandle | null) => {
    if (handle) terminalHandles.current.set(terminalId, handle);
    else terminalHandles.current.delete(terminalId);
  }, []);

  const registerServiceHandle = useCallback((serviceName: string, handle: PaneHandle | null) => {
    if (handle) serviceHandles.current.set(serviceName, handle);
    else serviceHandles.current.delete(serviceName);
  }, []);

  const handleClearStatus = useCallback(
    (terminalId: string, kind: StatusKind) => ClearStatus(projectName, terminalId, kind),
    [projectName],
  );

  const resolveActiveHandle = useCallback(
    (paneId: string): InteractivePaneHandle | PaneHandle | null => {
      const pane = getPane(paneId);
      if (!pane) return null;
      if (pane.activeServiceName) {
        return serviceHandles.current.get(pane.activeServiceName) ?? null;
      }
      const active = pane.tabs[pane.activeTabIdx];
      return active ? terminalHandles.current.get(active.id) ?? null : null;
    },
    [getPane],
  );

  const handleClearPane = useCallback(
    (paneId: string) => {
      resolveActiveHandle(paneId)?.clear();
    },
    [resolveActiveHandle],
  );

  const handleToggleFullscreen = useCallback((paneId: string) => {
    setFullscreenPaneId((current) => (current === paneId ? null : paneId));
  }, []);

  // Open the review tab in a pane, or focus it if one already exists, so the
  // dropdown never spawns duplicate review tabs (⌘⇧R adds the close half).
  const openReviewInPane = useCallback(
    (paneId: string) => {
      const pane = getPane(paneId);
      if (!pane) return;
      const reviewIdx = pane.tabs.findIndex((t) => t.kind === "review");
      if (reviewIdx < 0) addReviewToPane(paneId);
      else focusTerminal(paneId, reviewIdx);
    },
    [getPane, addReviewToPane, focusTerminal],
  );

  const findInPane = useCallback(
    (paneId: string, query: string, direction: "next" | "prev"): boolean => {
      const handle = resolveActiveHandle(paneId);
      if (!handle) return false;
      return direction === "next" ? handle.findNext(query) : handle.findPrevious(query);
    },
    [resolveActiveHandle],
  );

  const filterInPane = useCallback(
    (paneId: string, query: string | null) => {
      resolveActiveHandle(paneId)?.setFilter(query, setMatchCount);
    },
    [resolveActiveHandle],
  );

  const toggleFilterMode = useCallback(() => {
    const next = !filterMode;
    setFilterMode(next);
    void saveSettings({ searchFilterMode: next });
  }, [filterMode]);

  const handleCloseSearch = useCallback(() => {
    setSearchPaneId((current) => {
      if (current) {
        const handle = resolveActiveHandle(current);
        handle?.clearSearch();
        handle?.setFilter(null);
      }
      return null;
    });
  }, [resolveActiveHandle]);

  useEffect(() => {
    setOutputs(new Array(stableServices.length).fill(""));

    // Without services there's nothing to stream — skip the backend tmux poll.
    if (stableServices.length === 0) return;

    let eventCleanup: (() => void) | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let streaming = false;
    let prevPollOutputs: string[] = [];

    try {
      StartLogStreaming(projectName).catch(() => {});
      const cancel = EventsOn("log-update", (update: { project: string; pane: number; content: string }) => {
        if (update?.project !== projectName) return;
        setOutputs((prev) => {
          if (update.pane < 0 || update.pane >= prev.length) return prev;
          if (prev[update.pane] === update.content) return prev;
          const next = [...prev];
          next[update.pane] = update.content;
          return next;
        });
      });
      if (typeof cancel === "function") eventCleanup = cancel;
      streaming = true;
    } catch {
      // fall through to polling
    }

    const poll = async () => {
      try {
        const results = await Promise.all(
          stableServices.map((_, i) =>
            GetServiceLogs(projectName, i, 1000).catch(() => "(no output)"),
          ),
        );
        const changed = results.some((r, i) => r !== prevPollOutputs[i]);
        if (changed) {
          prevPollOutputs = results;
          setOutputs(results);
        }
      } catch {}
    };

    if (!streaming) {
      poll();
      pollInterval = setInterval(poll, 1000);
    }

    const shouldPause = () => document.hidden || !visibleRef.current;

    const onVisibility = () => {
      if (shouldPause()) {
        StopLogStreaming(projectName).catch(() => {});
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      } else {
        if (streaming) {
          StartLogStreaming(projectName).catch(() => {});
        } else if (!pollInterval) {
          poll();
          pollInterval = setInterval(poll, 1000);
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (eventCleanup) eventCleanup();
      if (pollInterval) clearInterval(pollInterval);
      StopLogStreaming(projectName).catch(() => {});
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [projectName, stableServices]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (stableServices.length === 0) return;
    if (visible) {
      StartLogStreaming(projectName).catch(() => {});
    } else {
      StopLogStreaming(projectName).catch(() => {});
    }
  }, [visible, projectName, stableServices.length]);

  useKeyboardShortcut(
    [
      { key: "=", meta: true },
      { key: "+", meta: true },
      { key: "-", meta: true },
      { key: "w", meta: true },
      { key: "d", meta: true },
      { key: "f", meta: true },
      { key: "i", meta: true },
      { key: "r", meta: true, shift: true },
      { key: "Escape", preventDefault: false },
    ],
    (event, matched) => {
      if (matched.key === "=" || matched.key === "+") return onZoomIn();
      if (matched.key === "-") return onZoomOut();
      if (matched.key === "r") {
        const pane = getFocusedPane();
        if (!pane) return;
        const reviewIdx = pane.tabs.findIndex((t) => t.kind === "review");
        if (reviewIdx >= 0 && !pane.activeServiceName && pane.activeTabIdx === reviewIdx) {
          closeTerminal(pane.id, reviewIdx);
        } else {
          openReviewInPane(pane.id);
        }
        return;
      }
      if (matched.key === "i") {
        if (focusedComposerTerminalId) useComposerStore.getState().toggle();
        return;
      }
      if (matched.key === "w") {
        const pane = getFocusedPane();
        if (!pane || pane.tabs.length === 0 || pane.activeServiceName) return;
        if (isTabPinned(pane, pane.activeTabIdx)) {
          toast.error("Can't close a pinned tab. Right-click the tab to unpin first.", {
            id: "pinned-tab-close-blocked",
          });
          return;
        }
        closeTerminal(pane.id, pane.activeTabIdx);
        return;
      }
      if (matched.key === "d") {
        const pane = getFocusedPane();
        if (!pane) return;
        splitPane(pane.id, event.shiftKey ? "col" : "row");
        return;
      }
      if (matched.key === "f") {
        const pane = getFocusedPane();
        if (!pane) return;
        setSearchPaneId(pane.id);
        setFilterMode(getSettings().searchFilterMode ?? false);
        setMatchCount(0);
        return;
      }
      if (matched.key === "Escape" && fullscreenPaneId) {
        event.preventDefault();
        setFullscreenPaneId(null);
      }
    },
    visible,
  );

  // Cycles the focused pane's header entries — configurable in Settings ▸
  // Keyboard Shortcuts. The combo must carry ⌘ to escape the interactive
  // terminal's key handler (it only forwards non-meta keys to the agent);
  // capture phase beats the composer's keydown stopPropagation so it works
  // while typing too.
  const hotkeys = useSettingsStore((s) => s.hotkeys);
  const { paneNavShortcuts, dirByCanonical } = useMemo(() => {
    const paneNavShortcuts: KeyboardShortcut[] = [];
    const dirByCanonical = new Map<string, 1 | -1>();
    const entries: Array<[HotkeyId, 1 | -1]> = [
      ["tabSwitchNext", 1],
      ["tabSwitchPrev", -1],
    ];
    for (const [id, dir] of entries) {
      const parsed = parseShortcut(resolveHotkey(hotkeys, id));
      if (!parsed) continue;
      const canon = canonicalShortcut(parsed);
      if (dirByCanonical.has(canon)) continue;
      dirByCanonical.set(canon, dir);
      paneNavShortcuts.push(parsed);
    }
    return { paneNavShortcuts, dirByCanonical };
  }, [hotkeys]);

  useKeyboardShortcut(
    paneNavShortcuts,
    (_event, matched) => {
      const pane = getFocusedPane();
      if (!pane) return;
      const dir = dirByCanonical.get(canonicalShortcut(matched)) ?? 1;
      const serviceNames = stableServices.map((s) => s.name);
      focusAdjacentPaneItem(pane.id, dir, serviceNames);
    },
    visible && paneNavShortcuts.length > 0,
    true,
  );

  const focusedPane = getFocusedPane();
  // The focused pane's active tab (or null for a service log / empty pane). TTS
  // and the composer both derive from this single resolution.
  const activeTab = useMemo(() => {
    if (!focusedPane || focusedPane.activeServiceName || focusedPane.tabs.length === 0) return null;
    const idx = Math.min(focusedPane.activeTabIdx, focusedPane.tabs.length - 1);
    return focusedPane.tabs[idx] ?? null;
  }, [focusedPane]);

  const activeTerminalId = activeTab?.id ?? null;

  useTTSHotkeys(activeTerminalId);

  // Shared open/close flag; each pane renders its own input when this is on.
  const composerOpen = useComposerStore((s) => s.open);

  // Gates the footer toggle and ⌘I on the focused pane's active terminal, so the
  // toggle always shows/hides an input where the user is looking, never a dead
  // toggle. null while that pane shows a browser/review tab, a service log, or
  // has no tabs.
  const focusedComposerTerminalId =
    activeTab && isTerminalTab(activeTab) ? activeTab.id : null;

  useEffect(() => {
    useComposerStore.getState().setActive(projectName, focusedComposerTerminalId);
  }, [projectName, focusedComposerTerminalId]);

  const submitInputToTerminal = useCallback(
    (terminalId: string, input: string | string[]): boolean => {
      const handle = terminalHandles.current.get(terminalId);
      const ok = handle?.submitInput(input) ?? false;
      // A live session also returns false transiently while a prior submit is
      // still delivering, so only warn for a genuinely dead/missing session.
      if (!ok && (!handle || isInteractivePaneSessionDead(terminalId))) {
        toast.error("This terminal isn't accepting input right now.");
      }
      return ok;
    },
    [],
  );

  const focusTerminalInput = useCallback((terminalId: string) => {
    terminalHandles.current.get(terminalId)?.focus();
  }, []);

  // Stopping a running service is a toggle — the service tab only exists while
  // the service runs, so toggling it from that tab always stops it.
  const toggleService = useAppStore((s) => s.toggleService);
  const stopService = useCallback(
    (serviceName: string) => {
      void toggleService(projectName, serviceName);
    },
    [toggleService, projectName],
  );

  // Final wiring for the generator run-flow. Once the freshly created project
  // is the active one this view is showing, open a terminal that launches the
  // configured agent CLI with the init prompt as a command-line argument
  // (e.g. `claude '<prompt>'`). We deliberately do NOT type the prompt into the
  // agent's TUI after launch: agents like claude boot through several async
  // phases (MCP load, auth checks) whose pauses fool idle-based injection into
  // firing mid-boot, landing the prompt in the wrong place and never submitting
  // it. Passing it as a launch arg sidesteps the timing entirely.
  const pendingGeneratorRun = useAppStore((s) => s.pendingGeneratorRun);
  const clearPendingGeneratorRun = useAppStore((s) => s.clearPendingGeneratorRun);
  const selectedProject = useAppStore((s) => s.selected);
  const defaultAiCli = useSettingsStore((s) => s.aiCli) || "claude";
  // Fire once per mount. Clearing the store isn't enough on its own: under
  // StrictMode the effect is double-invoked synchronously and both runs close
  // over the same non-null pendingGeneratorRun, so without this guard the agent
  // terminal spawns twice in dev. A new run always targets a new project, hence
  // a fresh TerminalView mount and a fresh ref.
  const generatorRunConsumedRef = useRef(false);

  useEffect(() => {
    if (
      !pendingGeneratorRun ||
      pendingGeneratorRun.projectName !== projectName ||
      selectedProject !== projectName
    ) {
      return;
    }
    if (generatorRunConsumedRef.current) return;
    generatorRunConsumedRef.current = true;
    const { spec } = pendingGeneratorRun;
    clearPendingGeneratorRun();
    const { label, cmd } = buildGeneratorRunCommand(spec, defaultAiCli);
    if (cmd) void createTerminalWithCmd(label, cmd);
  }, [
    pendingGeneratorRun,
    selectedProject,
    projectName,
    defaultAiCli,
    createTerminalWithCmd,
    clearPendingGeneratorRun,
  ]);

  const sendCommandToActive = useCallback(
    (cmd: string): boolean => {
      if (!focusedComposerTerminalId) {
        toast.error("Open a terminal first to run this command.");
        return false;
      }
      return submitInputToTerminal(focusedComposerTerminalId, cmd);
    },
    [focusedComposerTerminalId, submitInputToTerminal],
  );

  useImperativeHandle(
    ref,
    () => ({ createTerminal, createTerminalWithCmd, resumeFromHistory, sendCommandToActive }),
    [createTerminal, createTerminalWithCmd, resumeFromHistory, sendCommandToActive],
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-lg border-t border-x border-[var(--border)] bg-[var(--terminal-bg)]"
      style={containerStyle}
    >
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
      {tree ? (
        <TerminalTabDnd tree={tree} onReorder={reorderTerminals} onMove={moveTerminal}>
          <PaneLayout
            node={tree}
            projectName={projectName}
            visible={visible}
            focusedPaneId={focusedPaneId}
            fullscreenPaneId={fullscreenPaneId}
            searchPaneId={searchPaneId}
            filterMode={filterMode}
            matchCount={matchCount}
            canClose={tree.kind === "split"}
            fontSize={fontSize}
            composerOpen={composerOpen}
            themeOverride={xtermTheme}
            services={serviceTabInfos}
            allTerminals={allTerminals}
            interactiveCwd={projectRoot}
            runningPaneIDs={runningPaneIDs}
            donePaneIDs={donePaneIDs}
            waitingPaneIDs={waitingPaneIDs}
            errorPaneIDs={errorPaneIDs}
            onFocusPane={focusPane}
            onFocusTab={focusTerminal}
            onFocusService={focusService}
            onStopService={stopService}
            onAddTerminal={addTerminalToPane}
            onAddBrowser={addBrowserToPane}
            onAddReview={openReviewInPane}
            onCloseTerminal={closeTerminal}
            onRenameTerminal={renameTerminal}
            onTogglePinTab={toggleTabPinned}
            onSplit={splitPane}
            onClosePane={closePane}
            onClearPane={handleClearPane}
            onToggleFullscreen={handleToggleFullscreen}
            onRegisterTerminalHandle={registerTerminalHandle}
            onRegisterServiceHandle={registerServiceHandle}
            onClearStatus={handleClearStatus}
            onSubmitInput={submitInputToTerminal}
            onFocusTerminalInput={focusTerminalInput}
            onRatioChange={setRatio}
            onFindInPane={findInPane}
            onFilterInPane={filterInPane}
            onToggleFilterMode={toggleFilterMode}
            onCloseSearch={handleCloseSearch}
          />
        </TerminalTabDnd>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
          <TerminalIcon />
          <p className="text-xs">No terminals yet</p>
          <button
            onClick={() => createTerminal()}
            className="flex items-center gap-2 rounded-lg bg-[var(--text-primary)] px-4 py-2 text-xs font-medium text-[var(--bg-primary)] transition-all hover:opacity-85"
          >
            New Terminal
            <kbd className="ml-1 text-[10px] opacity-70">⌘T</kbd>
          </button>
        </div>
      )}
      <TTSControls />
      </div>
      </div>
  );
}
