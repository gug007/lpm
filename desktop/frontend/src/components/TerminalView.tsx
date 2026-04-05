import { useState, useEffect, useMemo, useRef, useCallback, useImperativeHandle } from "react";
import { toast } from "sonner";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { GetServiceLogs, StartLogStreaming, StopLogStreaming, StartService, StopService } from "../../wailsjs/go/main/App";
import type { ITheme } from "@xterm/xterm";
import { Pane, PaneHandle } from "./Pane";
import { InteractivePane, InteractivePaneHandle } from "./InteractivePane";
import { getSettings, saveSettings } from "../settings";
import { getProjectTerminals, saveProjectTerminals } from "../terminals";
import { type TerminalThemeName, terminalThemeNames, getTerminalThemeColors, terminalThemeCssVars } from "../terminal-themes";
import { ansiColors } from "./terminal-utils";
import { XIcon, TrashIcon, SettingsIcon, CheckIcon, ChevronDownIcon, PlayIcon, StopIcon } from "./icons";
import { HeaderTab } from "./terminal/HeaderTab";
import { IconBtn } from "./terminal/IconBtn";
import { Tooltip } from "./ui/Tooltip";
import {
  SearchIcon,
  ArrowDownIcon,
  MinusIcon,
  PlusIcon,
  ChevronUpIcon,
  ExpandIcon,
  ShrinkIcon,
} from "./terminal/icons";
import { useTerminals } from "../hooks/useTerminals";

interface TerminalViewProps {
  projectName: string;
  services: { name: string }[];
  terminalTheme: TerminalThemeName;
  onTerminalThemeChange: (theme: TerminalThemeName) => void;
  onTerminalCountChange?: (count: number) => void;
  visible?: boolean;
  ref?: React.Ref<TerminalViewHandle>;
}

function TerminalSettingsPanel({ fontSize, onZoomIn, onZoomOut, terminalTheme, onTerminalThemeChange }: {
  fontSize: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  terminalTheme: TerminalThemeName;
  onTerminalThemeChange: (theme: TerminalThemeName) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-[var(--bg-primary)] p-6">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="space-y-1.5">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Font Size
          </h2>
          <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-4 py-3">
            <button
              onClick={onZoomOut}
              className="flex items-center justify-center rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <MinusIcon />
            </button>
            <span className="min-w-[2rem] text-center font-mono text-sm tabular-nums text-[var(--text-primary)]">
              {fontSize}
            </span>
            <button
              onClick={onZoomIn}
              className="flex items-center justify-center rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <PlusIcon />
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Terminal Theme
          </h2>
          <div className="rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
            {terminalThemeNames.map((name) => {
              const colors = getTerminalThemeColors(name);
              const selected = terminalTheme === name;
              return (
                <button
                  key={name}
                  onClick={() => onTerminalThemeChange(name)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs transition-colors hover:bg-[var(--bg-hover)] ${
                    selected ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                  }`}
                >
                  <span
                    className="inline-block h-4 w-4 shrink-0 rounded-full border border-[var(--border)]"
                    style={{ background: colors?.bg ?? "var(--terminal-bg)" }}
                  />
                  <span className="flex-1">{name === "default" ? "Default" : name}</span>
                  {selected && <CheckIcon />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
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

export function TerminalView({ projectName, services, terminalTheme, onTerminalThemeChange, onTerminalCountChange, visible = true, ref }: TerminalViewProps) {
  const [activePane, setActivePane] = useState<ActivePane>(() =>
    deserializeActivePane(getProjectTerminals(projectName).activeTab)
  );
  const [outputs, setOutputs] = useState<string[]>([]);
  const [fontSize, setFontSize] = useState(() => getSettings().terminalFontSize || 12);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const paneRefs = useRef<(PaneHandle | null)[]>([]);
  const interactivePaneRefs = useRef<(InteractivePaneHandle | null)[]>([]);
  const paneScrollState = useRef<Record<string, boolean>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const prevOutputs = useRef<string[]>([]);
  const activePaneRef = useRef(activePane);
  const visibleRef = useRef(visible);
  const mountedRef = useRef(false);

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

  const persistFontSize = (size: number) => {
    const s = getSettings();
    if (s.terminalFontSize !== size) saveSettings({ ...s, terminalFontSize: size });
  };

  const zoomIn = () => setFontSize((s) => { const n = Math.min(s + 1, 24); if (n !== s) persistFontSize(n); return n; });
  const zoomOut = () => setFontSize((s) => { const n = Math.max(s - 1, 8); if (n !== s) persistFontSize(n); return n; });

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
            GetServiceLogs(projectName, i, 1000).catch(() => "(no output)")
          )
        );
        const changed = results.some((r, i) => r !== prevOutputs.current[i]);
        if (changed) {
          prevOutputs.current = results;
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
      if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoomIn(); }
      if (mod && e.key === "-") { e.preventDefault(); zoomOut(); }
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
              onClick={() => setActivePane({ type: "terminal", index: i })}
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
          <IconBtn onClick={() => forActivePanes((p) => p.clear())} title="Clear"><TrashIcon /></IconBtn>
          <IconBtn onClick={() => setShowSettings((v) => !v)} title="Terminal settings" active={showSettings}><SettingsIcon /></IconBtn>
          <IconBtn onClick={() => setFullscreen((v) => !v)} title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}>
            {fullscreen ? <ShrinkIcon /> : <ExpandIcon />}
          </IconBtn>
          {!atBottom && !showSettings && (
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

      {showSettings && (
        <TerminalSettingsPanel
          fontSize={fontSize}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          terminalTheme={terminalTheme}
          onTerminalThemeChange={onTerminalThemeChange}
        />
      )}
      <div className={showSettings ? "hidden" : `flex min-h-0 flex-1 overflow-hidden ${showAll && hasMultiple && activeTermIdx === null ? "divide-x divide-[var(--border)]" : ""}`}>
        {stableServices.map((svc, i) => {
          const paneVisible = visible && !showSettings && activeTermIdx === null && (showAll || activePane === i);
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
                  <Tooltip content={stopped ? `Start ${svc.name}` : `Stop ${svc.name}`}>
                    <button
                      onClick={() => (stopped ? handleStartService(i) : handleStopService(i))}
                      className={`rounded p-0.5 transition-colors hover:bg-[var(--terminal-header-hover)] ${
                        stopped
                          ? "text-[var(--accent-green)]"
                          : "text-[var(--terminal-header-text)] hover:text-[var(--terminal-tab-active)]"
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
          const paneVisible = visible && !showSettings && activeTermIdx === i;
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
