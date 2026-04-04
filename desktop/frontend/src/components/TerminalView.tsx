import { useState, useEffect, useMemo, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { GetServiceLogs, StartLogStreaming, StopLogStreaming, StartTerminal, StartTerminalWithConfig, StopTerminal, WriteTerminal } from "../../wailsjs/go/main/App";
import type { ITheme } from "@xterm/xterm";
import { Pane, PaneHandle } from "./Pane";
import { InteractivePane, InteractivePaneHandle } from "./InteractivePane";
import { getSettings, saveSettings } from "../settings";
import { getProjectTerminals, saveProjectTerminals } from "../terminals";
import { type TerminalThemeName, terminalThemeNames, getTerminalThemeColors, terminalThemeCssVars } from "../terminal-themes";
import { ansiColors } from "./terminal-utils";
import { iconProps, XIcon, TrashIcon, SettingsIcon, CheckIcon, ChevronDownIcon } from "./icons";

interface TerminalViewProps {
  projectName: string;
  services: { name: string }[];
  terminalTheme: TerminalThemeName;
  onTerminalThemeChange: (theme: TerminalThemeName) => void;
  visible?: boolean;
}

function SearchIcon() { return <svg {...iconProps}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>; }
function ArrowDownIcon() { return <svg {...iconProps}><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>; }
function MinusIcon() { return <svg {...iconProps}><path d="M5 12h14" /></svg>; }
function PlusIcon() { return <svg {...iconProps}><path d="M12 5v14" /><path d="M5 12h14" /></svg>; }
function ChevronUpIcon() { return <svg {...iconProps}><path d="m18 15-6-6-6 6" /></svg>; }

function ExpandIcon() { return <svg {...iconProps}><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>; }
function ShrinkIcon() { return <svg {...iconProps}><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></svg>; }
function IconBtn({ onClick, title, children, active, className = "" }: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center rounded p-1 transition-colors ${
        active
          ? "bg-[var(--terminal-header-active)] text-[var(--terminal-tab-active)]"
          : "text-[var(--terminal-header-text)] hover:bg-[var(--terminal-header-hover)] hover:text-[var(--terminal-tab-active)]"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function HeaderTab({ label, active, onClick, onClose, onRename }: { label: string; active: boolean; onClick: () => void; onClose?: () => void; onRename?: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    setDraft(label);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== label) onRename?.(trimmed);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-24 rounded-md bg-[var(--terminal-header-active)] px-2 py-1 font-mono text-[11px] font-medium text-[var(--terminal-tab-active)] outline-none"
      />
    );
  }

  return (
    <button
      onClick={onClick}
      onDoubleClick={onRename ? () => setEditing(true) : undefined}
      className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-colors ${
        active
          ? "bg-[var(--terminal-header-active)] text-[var(--terminal-tab-active)]"
          : "text-[var(--terminal-header-text)] hover:text-[var(--terminal-tab-active)]"
      }`}
    >
      {label}
      {onClose && (
        <span
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="ml-0.5 rounded p-0.5 opacity-60 hover:bg-[var(--terminal-header-hover)] hover:opacity-100"
        >
          <XIcon />
        </span>
      )}
    </button>
  );
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

interface InteractiveTerminal {
  id: string;
  label: string;
}

export interface TerminalViewHandle {
  createTerminalWithCmd(label: string, terminalConfigName: string, cmd: string): void;
}

export const TerminalView = forwardRef<TerminalViewHandle, TerminalViewProps>(function TerminalView({ projectName, services, terminalTheme, onTerminalThemeChange, visible = true }, ref) {
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
  const [terminals, setTerminals] = useState<InteractiveTerminal[]>([]);
  const paneRefs = useRef<(PaneHandle | null)[]>([]);
  const interactivePaneRefs = useRef<(InteractivePaneHandle | null)[]>([]);
  const paneScrollState = useRef<Record<string, boolean>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const prevOutputs = useRef<string[]>([]);
  const activePaneRef = useRef(activePane);
  const terminalsRef = useRef(terminals);
  const visibleRef = useRef(visible);
  const mountedRef = useRef(false);

  activePaneRef.current = activePane;
  terminalsRef.current = terminals;
  visibleRef.current = visible;

  // Persist active tab to config whenever it changes
  useEffect(() => {
    const key = serializeActivePane(activePane);
    const state = getProjectTerminals(projectName);
    if (state.activeTab !== key) {
      saveProjectTerminals(projectName, { ...state, activeTab: key });
    }
  }, [activePane, projectName]);

  const persistTerminals = useCallback((terms: InteractiveTerminal[]) => {
    const state = getProjectTerminals(projectName);
    saveProjectTerminals(projectName, {
      ...state,
      terminals: terms.map((t) => ({ label: t.label })),
    });
  }, [projectName]);

  const servicesKey = useMemo(
    () => services.map((s) => s.name).join(","),
    [services]
  );
  const stableServices = useMemo(() => services, [servicesKey]);

  // Restore saved terminals on mount (or create a default if no tabs at all)
  useEffect(() => {
    const saved = getProjectTerminals(projectName).terminals;
    const hasServices = services.length > 0;
    const entries = saved && saved.length > 0 ? saved : !hasServices ? [{ label: "Terminal 1" }] : null;
    if (!entries) return;
    let cancelled = false;
    const startedIds: string[] = [];
    (async () => {
      const results = await Promise.allSettled(
        entries.map(() => StartTerminal(projectName))
      );
      const restored: InteractiveTerminal[] = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          startedIds.push(r.value);
          restored.push({ id: r.value, label: entries[i].label });
        }
      });
      if (cancelled) {
        restored.forEach((t) => StopTerminal(t.id).catch(() => {}));
      } else {
        setTerminals(restored);
        if (!saved || saved.length === 0) {
          setActivePane({ type: "terminal", index: 0 });
        }
      }
    })();
    return () => {
      cancelled = true;
      startedIds.forEach((id) => StopTerminal(id).catch(() => {}));
    };
  }, [projectName]);

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

  const getActivePane = useCallback((): PaneHandle | InteractivePaneHandle | null => {
    const ap = activePaneRef.current;
    const ti = terminalIndex(ap);
    if (ti !== null) return interactivePaneRefs.current[ti] ?? null;
    if (ap === "all") return paneRefs.current[0] ?? null;
    if (typeof ap === "number") return paneRefs.current[ap] ?? null;
    return null;
  }, []);

  const toggleSearch = useCallback(() => {
    setShowSearch((prev) => {
      if (!prev) setTimeout(() => searchInputRef.current?.focus(), 0);
      return !prev;
    });
  }, []);

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery("");
    getActivePane()?.clearSearch();
    setTimeout(() => getActivePane()?.focus?.(), 0);
  }, [getActivePane]);

  const persistFontSize = useCallback((size: number) => {
    const s = getSettings();
    if (s.terminalFontSize !== size) saveSettings({ ...s, terminalFontSize: size });
  }, []);

  const zoomIn = useCallback(() => setFontSize((s) => { const n = Math.min(s + 1, 24); if (n !== s) persistFontSize(n); return n; }), [persistFontSize]);
  const zoomOut = useCallback(() => setFontSize((s) => { const n = Math.max(s - 1, 8); if (n !== s) persistFontSize(n); return n; }), [persistFontSize]);

  const forActivePanes = useCallback((fn: (p: PaneHandle | InteractivePaneHandle) => void) => {
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
  }, []);

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
  }, [toggleSearch, zoomIn, zoomOut, closeSearch]);

  // New terminal management
  const pendingTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const addTerminal = useCallback((id: string, label: string) => {
    const index = terminalsRef.current.length;
    const next = [...terminalsRef.current, { id, label }];
    setTerminals(next);
    setActivePane({ type: "terminal", index });
    persistTerminals(next);
  }, [persistTerminals]);

  const handleNewTerminal = useCallback(async () => {
    try {
      const id = await StartTerminal(projectName);
      addTerminal(id, `Terminal ${terminalsRef.current.length + 1}`);
    } catch {}
  }, [projectName, addTerminal]);

  const handleCloseTerminal = useCallback((index: number) => {
    const term = terminalsRef.current[index];
    if (!term) return;
    StopTerminal(term.id).catch(() => {});
    const next = terminalsRef.current.filter((_, i) => i !== index);
    setTerminals(next);
    interactivePaneRefs.current.splice(index, 1);
    setActivePane((ap) => {
      if (typeof ap === "object" && ap.type === "terminal") {
        if (ap.index === index) return "all";
        if (ap.index > index) return { type: "terminal", index: ap.index - 1 };
      }
      return ap;
    });
    persistTerminals(next);
  }, [persistTerminals]);

  const handleRenameTerminal = useCallback((index: number, name: string) => {
    const next = terminalsRef.current.map((t, i) =>
      i === index ? { ...t, label: name } : t
    );
    setTerminals(next);
    persistTerminals(next);
  }, [persistTerminals]);

  const createTerminalWithCmd = useCallback(async (label: string, terminalConfigName: string, cmd: string) => {
    const id = await StartTerminalWithConfig(projectName, terminalConfigName);
    addTerminal(id, label);
    const timer = setTimeout(() => {
      pendingTimers.current.delete(timer);
      WriteTerminal(id, cmd + "\n").catch(() => {});
    }, 300);
    pendingTimers.current.add(timer);
  }, [projectName, addTerminal]);

  useImperativeHandle(ref, () => ({ createTerminalWithCmd }), [createTerminalWithCmd]);

  // Cleanup all terminals and pending timers on unmount
  useEffect(() => {
    return () => {
      pendingTimers.current.forEach(clearTimeout);
      terminalsRef.current.forEach((t) => {
        StopTerminal(t.id).catch(() => {});
      });
    };
  }, []);

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
              onClose={() => handleCloseTerminal(i)}
              onRename={(name) => handleRenameTerminal(i, name)}
            />
          ))}
          <button
            onClick={handleNewTerminal}
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
          return (
            <div
              key={svc.name}
              className={paneVisible ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "hidden"}
            >
              <Pane
                ref={(el) => { paneRefs.current[i] = el; }}
                label={showAll && hasMultiple ? svc.name : undefined}
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
});
