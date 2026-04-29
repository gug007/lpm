import { useState, useEffect, useMemo, useRef, useCallback, useImperativeHandle } from "react";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { GetServiceLogs, StartLogStreaming, StopLogStreaming, ClearStatus } from "../../wailsjs/go/main/App";
import type { ITheme } from "@xterm/xterm";
import { disposePaneSession, type PaneHandle } from "./Pane";
import { disposeInteractivePaneSession, type InteractivePaneHandle } from "./InteractivePane";
import { collectTerminals } from "../paneTree";
import { PaneLayout } from "./PaneLayout";
import { TerminalTabDnd } from "./TerminalTabDnd";
import type { ServiceTabInfo, StatusKind } from "./PaneView";
import { type TerminalThemeName, getTerminalThemeColors, terminalThemeCssVars } from "../terminal-themes";
import { ansiColors } from "./terminal-utils";
import { TerminalIcon } from "./icons";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import { useTerminals, type TerminalStartOpts } from "../hooks/useTerminals";
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
}

export function TerminalView({ projectName, projectRoot, services, terminalTheme, onTerminalCountChange, fontSize, onZoomIn, onZoomOut, runningPaneIDs, donePaneIDs, waitingPaneIDs, errorPaneIDs, visible = true, ref }: TerminalViewProps) {
  const [outputs, setOutputs] = useState<string[]>([]);
  const [fullscreenPaneId, setFullscreenPaneId] = useState<string | null>(null);
  const [searchPaneId, setSearchPaneId] = useState<string | null>(null);

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
    addTerminalToPane,
    closeTerminal,
    focusTerminal,
    focusService,
    renameTerminal,
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
      })),
    [stableServices, outputs, projectName, projectRoot],
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
      if (!next.has(id)) disposeInteractivePaneSession(id);
    }
    interactiveKeysRef.current = next;
  }, [tree]);

  useEffect(() => {
    return () => {
      for (const id of interactiveKeysRef.current) disposeInteractivePaneSession(id);
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

  const findInPane = useCallback(
    (paneId: string, query: string, direction: "next" | "prev"): boolean => {
      const handle = resolveActiveHandle(paneId);
      if (!handle) return false;
      return direction === "next" ? handle.findNext(query) : handle.findPrevious(query);
    },
    [resolveActiveHandle],
  );

  const handleCloseSearch = useCallback(() => {
    setSearchPaneId((current) => {
      if (current) resolveActiveHandle(current)?.clearSearch();
      return null;
    });
  }, [resolveActiveHandle]);

  useEffect(() => {
    setOutputs(new Array(stableServices.length).fill(""));

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
    if (visible) {
      StartLogStreaming(projectName).catch(() => {});
    } else {
      StopLogStreaming(projectName).catch(() => {});
    }
  }, [visible, projectName]);

  useKeyboardShortcut(
    [
      { key: "=", meta: true },
      { key: "+", meta: true },
      { key: "-", meta: true },
      { key: "w", meta: true },
      { key: "d", meta: true },
      { key: "f", meta: true },
      { key: "Escape", preventDefault: false },
    ],
    (event, matched) => {
      if (matched.key === "=" || matched.key === "+") return onZoomIn();
      if (matched.key === "-") return onZoomOut();
      if (matched.key === "w") {
        const pane = getFocusedPane();
        if (!pane || pane.tabs.length === 0 || pane.activeServiceName) return;
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
        return;
      }
      if (matched.key === "Escape" && fullscreenPaneId) {
        event.preventDefault();
        setFullscreenPaneId(null);
      }
    },
    visible,
  );

  // Derive the active terminal ID from the focused pane for TTS hotkeys
  const focusedPane = getFocusedPane();
  const activeTerminalId = useMemo(() => {
    if (!focusedPane || focusedPane.activeServiceName || focusedPane.tabs.length === 0) return null;
    const idx = Math.min(focusedPane.activeTabIdx, focusedPane.tabs.length - 1);
    return focusedPane.tabs[idx]?.id ?? null;
  }, [focusedPane]);

  useTTSHotkeys(activeTerminalId);

  useImperativeHandle(
    ref,
    () => ({ createTerminal, createTerminalWithCmd }),
    [createTerminal, createTerminalWithCmd],
  );

  return (
    <div
      className="flex min-h-0 flex-1 overflow-hidden rounded-t-lg border-t border-x border-[var(--border)] bg-[var(--terminal-bg)]"
      style={containerStyle}
    >
      {tree ? (
        <TerminalTabDnd tree={tree} onReorder={reorderTerminals} onMove={moveTerminal}>
          <PaneLayout
            node={tree}
            visible={visible}
            focusedPaneId={focusedPaneId}
            fullscreenPaneId={fullscreenPaneId}
            searchPaneId={searchPaneId}
            canClose={tree.kind === "split"}
            fontSize={fontSize}
            themeOverride={xtermTheme}
            services={serviceTabInfos}
            interactiveCwd={projectRoot}
            runningPaneIDs={runningPaneIDs}
            donePaneIDs={donePaneIDs}
            waitingPaneIDs={waitingPaneIDs}
            errorPaneIDs={errorPaneIDs}
            onFocusPane={focusPane}
            onFocusTab={focusTerminal}
            onFocusService={focusService}
            onAddTerminal={addTerminalToPane}
            onCloseTerminal={closeTerminal}
            onRenameTerminal={renameTerminal}
            onSplit={splitPane}
            onClosePane={closePane}
            onClearPane={handleClearPane}
            onToggleFullscreen={handleToggleFullscreen}
            onRegisterTerminalHandle={registerTerminalHandle}
            onRegisterServiceHandle={registerServiceHandle}
            onClearStatus={handleClearStatus}
            onRatioChange={setRatio}
            onFindInPane={findInPane}
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
  );
}
