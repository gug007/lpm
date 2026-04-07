import { useState, useEffect, useMemo, useRef, useCallback, useImperativeHandle } from "react";
import { toast } from "sonner";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { GetServiceLogs, StartLogStreaming, StopLogStreaming, StartService, StopService, ClearDoneStatus, ClearWaitingStatus } from "../../wailsjs/go/main/App";
import type { ITheme } from "@xterm/xterm";
import { Pane, PaneHandle } from "./Pane";
import { InteractivePane, InteractivePaneHandle } from "./InteractivePane";
import { getProjectTerminals, saveProjectTerminals } from "../terminals";
import { type TerminalThemeName, getTerminalThemeColors, terminalThemeCssVars } from "../terminal-themes";
import { ansiColors } from "./terminal-utils";
import { XIcon, ChevronDownIcon, PlayIcon, StopIcon } from "./icons";
import { HeaderTab } from "./terminal/HeaderTab";
import { IconBtn } from "./terminal/IconBtn";
import { Tooltip } from "./ui/Tooltip";
import {
  SearchIcon,
  ArrowDownIcon,
  PlusIcon,
  ChevronUpIcon,
  ExpandIcon,
  ShrinkIcon,
  ClearIcon,
} from "./terminal/icons";
import { useTerminals } from "../hooks/useTerminals";

interface TerminalViewProps {
  projectName: string;
  services: { name: string }[];
  terminalTheme: TerminalThemeName;
  onTerminalCountChange?: (count: number) => void;
  fontSize: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  runningPaneIDs?: Set<string>;
  donePaneIDs?: Set<string>;
  waitingPaneIDs?: Set<string>;
  visible?: boolean;
  ref?: React.Ref<TerminalViewHandle>;
}

type ActivePane = number | "all" | { type: "terminal"; index: number };

function terminalIndex(ap: ActivePane): number | null {
  return typeof ap === "object" && ap.type === "terminal" ? ap.index : null;
}

function serializeActivePane(ap: ActivePane): string {
  if (ap === "all") return "all";
  if (typeof ap === "number") return `svc-${ap}`;
  return `term-${ap.index}`;
}

function deserializeActivePane(s: string | undefined): ActivePane {
  if (!s || s === "all") return "all";
  if (s.startsWith("svc-")) {
    const n = parseInt(s.slice(4), 10);
    return isNaN(n) ? "all" : n;
  }
  if (s.startsWith("term-")) {
    const n = parseInt(s.slice(5), 10);
    return isNaN(n) ? "all" : { type: "terminal", index: n };
  }
  return "all";
}

export interface TerminalViewHandle {
  createTerminal(): void;
  createTerminalWithCmd(label: string, terminalConfigName: string, cmd: string): void;
}

export function TerminalView({ projectName, services, terminalTheme, onTerminalCountChange, fontSize, onZoomIn, onZoomOut, runningPaneIDs, donePaneIDs, waitingPaneIDs, visible = true, ref }: TerminalViewProps) {
  const [activePane, setActivePane] = useState<ActivePane>(() =>
    deserializeActivePane(getProjectTerminals(projectName).activeTab)
  );
  const [outputs, setOutputs] = useState<string[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const paneRefs = useRef<(PaneHandle | null)[]>([]);
  const interactivePaneRefs = useRef<(InteractivePaneHandle | null)[]>([]);
  const paneScrollState = useRef<Record<string, boolean>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const prevOutputs = useRef<string[]>([]);
  const activePaneRef = useRef(activePane);
  const visibleRef = useRef(visible);
  const onZoomInRef = useRef(onZoomIn);
  const onZoomOutRef = useRef(onZoomOut);
  onZoomInRef.current = onZoomIn;
  onZoomOutRef.current = onZoomOut;
  const mountedRef = useRef(false);
  const stoppedServicesRef = useRef<Set<string>>(new Set());

  activePaneRef.current = activePane;
  visibleRef.current = visible;

  // Active-pane shift when a terminal tab closes
  const handleTerminalClosed = useCallback((index: number) => {
    interactivePaneRefs.current.splice(index, 1);
    setActivePane((ap) => {
      if (typeof ap === "object" && ap.type === "terminal") {
        if (ap.index === index) return "all";
        if (ap.index > index) return { type: "terminal", index: ap.index - 1 };
      }
      return ap;
    });
  }, []);

  const handleTerminalCreated = useCallback((index: number) => {
    setActivePane({ type: "terminal", index });
  }, []);

  const {
    terminals,
    createTerminal,
    createTerminalWithCmd,
    closeTerminal,
    renameTerminal,
  } = useTerminals(projectName, handleTerminalClosed, handleTerminalCreated);

  useEffect(() => { onTerminalCountChange?.(terminals.length); }, [terminals.length, onTerminalCountChange]);

  // Auto-clear Done/Waiting only when the user is actively viewing the terminal
  useEffect(() => {
    if (!visible) return;
    const ti = terminalIndex(activePane);
    if (ti !== null && terminals[ti]) {
      const id = terminals[ti].id;
      if (donePaneIDs?.has(id)) ClearDoneStatus(projectName, id);
      if (waitingPaneIDs?.has(id)) ClearWaitingStatus(projectName, id);
    }
  }, [visible, activePane, donePaneIDs, waitingPaneIDs, terminals, projectName]);

  // Persist active tab to config whenever it changes
  useEffect(() => {
    const key = serializeActivePane(activePane);
    const state = getProjectTerminals(projectName);
    if (state.activeTab !== key) {
      saveProjectTerminals(projectName, { ...state, activeTab: key });
    }
  }, [activePane, projectName]);

  const servicesKey = services.map((s) => s.name).join(",");
  const stableServices = useMemo(() => services, [servicesKey]);

  const [stoppedServices, setStoppedServices] = useState<Set<string>>(() => new Set());
  stoppedServicesRef.current = stoppedServices;
  // Reset stopped-service tracking when the service set changes (profile switch, project (re)start)
  useEffect(() => { setStoppedServices(new Set()); }, [servicesKey]);

  const handleStartService = async (idx: number) => {
    const name = stableServices[idx]?.name;
    if (!name) return;
    setStoppedServices((prev) => { const next = new Set(prev); next.delete(name); return next; });
    try {
      await StartService(projectName, idx);
    } catch (err) {
      setStoppedServices((prev) => new Set(prev).add(name));
      toast.error(`Start ${name}: ${err}`);
    }
  };

  const handleStopService = async (idx: number) => {
    const name = stableServices[idx]?.name;
    if (!name) return;
    setStoppedServices((prev) => new Set(prev).add(name));
    // Clear the xterm display and local buffer immediately; the backend clears
    // tmux pane + scrollback so old logs don't resurface on next start.
    paneRefs.current[idx]?.clear();
    setOutputs((prev) => {
      if (prev[idx] === "") return prev;
      const next = [...prev];
      next[idx] = "";
      return next;
    });
    try {
      await StopService(projectName, idx);
    } catch (err) {
      setStoppedServices((prev) => { const next = new Set(prev); next.delete(name); return next; });
      toast.error(`Stop ${name}: ${err}`);
    }
  };

  const activeTermIdx = terminalIndex(activePane);
  const showAll = activePane === "all";
  const hasMultiple = stableServices.length > 1;

  const { containerStyle, xtermTheme } = useMemo(() => {
    const colors = getTerminalThemeColors(terminalTheme);
    if (!colors) return { containerStyle: undefined, xtermTheme: null };
    return {
      containerStyle: terminalThemeCssVars(colors) as React.CSSProperties,
      xtermTheme: { background: colors.bg, foreground: colors.fg, selectionBackground: colors.selection, cursor: colors.cursor, ...ansiColors } as ITheme,
    };
  }, [terminalTheme]);

  const getActivePane = (): PaneHandle | InteractivePaneHandle | null => {
    const ap = activePaneRef.current;
    const ti = terminalIndex(ap);
    if (ti !== null) return interactivePaneRefs.current[ti] ?? null;
    if (ap === "all") return paneRefs.current[0] ?? null;
    if (typeof ap === "number") return paneRefs.current[ap] ?? null;
    return null;
  };

  const toggleSearch = () => {
    setShowSearch((prev) => {
      if (!prev) setTimeout(() => searchInputRef.current?.focus(), 0);
      return !prev;
    });
  };

  const closeSearch = () => {
    setShowSearch(false);
    setSearchQuery("");
    getActivePane()?.clearSearch();
    setTimeout(() => getActivePane()?.focus?.(), 0);
  };

  const forActivePanes = (fn: (p: PaneHandle | InteractivePaneHandle) => void) => {
    const ap = activePaneRef.current;
    const ti = terminalIndex(ap);
    if (ti !== null) {
      const p = interactivePaneRefs.current[ti];
      if (p) fn(p);
    } else if (ap === "all") {
      paneRefs.current.forEach((p) => p && fn(p));
    } else if (typeof ap === "number") {
      const p = paneRefs.current[ap];
      if (p) fn(p);
    }
  };

  useEffect(() => {
    setOutputs(new Array(stableServices.length).fill(""));
    prevOutputs.current = [];
    paneScrollState.current = {};

    let eventCleanup: (() => void) | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let streaming = false;

    const isStopped = (i: number) => {
      const name = stableServices[i]?.name;
      return !!name && stoppedServicesRef.current.has(name);
    };

    try {
      StartLogStreaming(projectName).catch(() => {});
      const cancel = EventsOn("log-update", (update: { project: string; pane: number; content: string }) => {
        if (update?.project !== projectName) return;
        setOutputs((prev) => {
          if (update.pane < 0 || update.pane >= prev.length) return prev;
          if (isStopped(update.pane)) return prev;
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
            GetServiceLogs(projectName, i, 1000).catch(() => "(no output)")
          )
        );
        const filtered = stoppedServicesRef.current.size === 0
          ? results
          : results.map((r, i) => (isStopped(i) ? "" : r));
        const changed = filtered.some((r, i) => r !== prevOutputs.current[i]);
        if (changed) {
          prevOutputs.current = filtered;
          setOutputs(filtered);
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
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
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

  // Pause/resume streaming when visibility changes (project switch)
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (visible) {
      StartLogStreaming(projectName).catch(() => {});
    } else {
      StopLogStreaming(projectName).catch(() => {});
    }
  }, [visible, projectName]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!visibleRef.current) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "f") { e.preventDefault(); toggleSearch(); }
      if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); onZoomInRef.current(); }
      if (mod && e.key === "-") { e.preventDefault(); onZoomOutRef.current(); }
      if (e.key === "Escape") {
        setFullscreen((fs) => { if (fs) { e.preventDefault(); return false; } return fs; });
        closeSearch();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({ createTerminal, createTerminalWithCmd }), [createTerminal, createTerminalWithCmd]);

  const handleSearch = (direction: "next" | "prev") => {
    if (!searchQuery) return;
    const pane = getActivePane();
    if (!pane) return;
    direction === "next" ? pane.findNext(searchQuery) : pane.findPrevious(searchQuery);
  };

  const handlePaneScroll = (key: string, isAtBottom: boolean) => {
    paneScrollState.current[key] = isAtBottom;
    const allAtBottom = Object.values(paneScrollState.current).every(Boolean);
    setAtBottom(allAtBottom);
  };

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--terminal-bg)]"
          : "flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-lg border-t border-x border-[var(--border)] bg-[var(--terminal-bg)]"
      }
      style={containerStyle}
    >
      <div className={`flex items-center gap-0.5 bg-[var(--terminal-header)] py-1.5 ${fullscreen ? "wails-drag pl-20 pr-3" : "rounded-t-lg px-3"}`}>
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {hasMultiple && (
            <HeaderTab label="All" active={showAll} onClick={() => setActivePane("all")} />
          )}
          {stableServices.map((svc, i) => (
            <HeaderTab key={svc.name} label={svc.name} active={activeTermIdx === null && activePane === i} onClick={() => setActivePane(i)} />
          ))}
          {terminals.length > 0 && (
            <div className="mx-1.5 h-3.5 w-px bg-[var(--terminal-header-hover)]" />
          )}
          {terminals.map((term, i) => (
            <HeaderTab
              key={term.id}
              label={term.label}
              active={activeTermIdx === i}
              shimmer={runningPaneIDs?.has(term.id)}
              done={activeTermIdx !== i && donePaneIDs?.has(term.id)}
              waiting={activeTermIdx !== i && waitingPaneIDs?.has(term.id)}
              onClick={() => {
                if (donePaneIDs?.has(term.id)) ClearDoneStatus(projectName, term.id);
                if (waitingPaneIDs?.has(term.id)) ClearWaitingStatus(projectName, term.id);
                setActivePane({ type: "terminal", index: i });
              }}
              onClose={() => closeTerminal(i)}
              onRename={(name) => renameTerminal(i, name)}
            />
          ))}
          <button
            onClick={createTerminal}
            title="New terminal"
            className="flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[11px] font-medium text-[var(--terminal-header-text)] transition-colors hover:bg-[var(--terminal-header-hover)] hover:text-[var(--terminal-tab-active)]"
          >
            <PlusIcon />
          </button>
        </div>

        <div className="relative flex shrink-0 items-center gap-0.5">
          <IconBtn onClick={toggleSearch} title="Search (Cmd+F)" active={showSearch}><SearchIcon /></IconBtn>
          <IconBtn onClick={() => forActivePanes((p) => p.clear())} title="Clear"><ClearIcon /></IconBtn>
          <IconBtn onClick={() => setFullscreen((v) => !v)} title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}>
            {fullscreen ? <ShrinkIcon /> : <ExpandIcon />}
          </IconBtn>
          {!atBottom && (
            <IconBtn
              onClick={() => {
                forActivePanes((p) => p.scrollToBottom());
                paneScrollState.current = {};
                setAtBottom(true);
              }}
              title="Scroll to bottom"
              className="text-[var(--accent-cyan)]"
            >
              <ArrowDownIcon />
            </IconBtn>
          )}
        </div>
      </div>

      {showSearch && (
        <div className="flex items-center gap-1 bg-[var(--terminal-header)] px-3 py-1 border-t border-[var(--terminal-header-hover)]">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleSearch(e.shiftKey ? "prev" : "next"); }
              if (e.key === "Escape") closeSearch();
            }}
            placeholder="Find in logs..."
            className="w-48 rounded-md border border-[var(--terminal-header-hover)] bg-[var(--terminal-bg)] px-2 py-0.5 font-mono text-[11px] text-[var(--terminal-fg)] outline-none placeholder:text-[var(--terminal-header-text)] focus:border-[var(--accent-cyan)]"
          />
          <IconBtn onClick={() => handleSearch("prev")} title="Previous (Shift+Enter)"><ChevronUpIcon /></IconBtn>
          <IconBtn onClick={() => handleSearch("next")} title="Next (Enter)"><ChevronDownIcon /></IconBtn>
          <IconBtn onClick={closeSearch} title="Close (Escape)"><XIcon /></IconBtn>
        </div>
      )}

      <div className={`flex min-h-0 flex-1 overflow-hidden ${showAll && hasMultiple && activeTermIdx === null ? "divide-x divide-[var(--border)]" : ""}`}>
        {stableServices.map((svc, i) => {
          const paneVisible = visible && activeTermIdx === null && (showAll || activePane === i);
          const showLabel = showAll && hasMultiple;
          const stopped = stoppedServices.has(svc.name);
          return (
            <div
              key={svc.name}
              className={paneVisible ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "hidden"}
            >
              <Pane
                ref={(el) => { paneRefs.current[i] = el; }}
                label={showLabel ? svc.name : undefined}
                onLabelClick={showLabel ? () => setActivePane(i) : undefined}
                labelActions={showLabel ? (
                  <Tooltip content={stopped ? `Start ${svc.name}` : `Stop ${svc.name}`} side="bottom" align="end">
                    <button
                      onClick={() => (stopped ? handleStartService(i) : handleStopService(i))}
                      className={`rounded p-0.5 transition-colors hover:bg-[var(--terminal-header-hover)] ${
                        stopped
                          ? "text-[var(--accent-green)]"
                          : "text-[var(--accent-red)]"
                      }`}
                    >
                      {stopped ? <PlayIcon /> : <StopIcon />}
                    </button>
                  </Tooltip>
                ) : undefined}
                output={outputs[i] || ""}
                visible={paneVisible}
                fontSize={fontSize}
                themeOverride={xtermTheme}
                onScrollStateChange={(ab) => handlePaneScroll(`svc-${i}`, ab)}
              />
            </div>
          );
        })}
        {terminals.map((term, i) => {
          const paneVisible = visible && activeTermIdx === i;
          return (
            <div
              key={term.id}
              className={paneVisible ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "hidden"}
            >
              <InteractivePane
                ref={(el) => { interactivePaneRefs.current[i] = el; }}
                terminalId={term.id}
                visible={paneVisible}
                fontSize={fontSize}
                themeOverride={xtermTheme}
                onScrollStateChange={(ab) => handlePaneScroll(`term-${i}`, ab)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
