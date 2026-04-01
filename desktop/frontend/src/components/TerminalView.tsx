import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { GetServiceLogs, StartLogStreaming, StopLogStreaming } from "../../wailsjs/go/main/App";
import type { ITheme } from "@xterm/xterm";
import { Pane, PaneHandle } from "./Pane";
import { getSettings, saveSettings } from "../settings";
import { type TerminalThemeName, terminalThemeNames, getTerminalThemeColors, terminalThemeCssVars } from "../terminal-themes";
import { iconProps } from "./icons";

interface TerminalViewProps {
  projectName: string;
  services: { name: string }[];
  terminalTheme: TerminalThemeName;
  onTerminalThemeChange: (theme: TerminalThemeName) => void;
}

function SearchIcon() { return <svg {...iconProps}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>; }
function TrashIcon() { return <svg {...iconProps}><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>; }
function ArrowDownIcon() { return <svg {...iconProps}><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>; }
function MinusIcon() { return <svg {...iconProps}><path d="M5 12h14" /></svg>; }
function PlusIcon() { return <svg {...iconProps}><path d="M12 5v14" /><path d="M5 12h14" /></svg>; }
function ChevronUpIcon() { return <svg {...iconProps}><path d="m18 15-6-6-6 6" /></svg>; }
function ChevronDownIcon() { return <svg {...iconProps}><path d="m6 9 6 6 6-6" /></svg>; }
function XIcon() { return <svg {...iconProps}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>; }
function PaletteIcon() { return <svg {...iconProps}><circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" /><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" /><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" /><circle cx="6.5" cy="12" r="0.5" fill="currentColor" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.5-.7 1.5-1.5 0-.4-.1-.7-.4-1-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16c3.3 0 6-2.7 6-6 0-5.5-4.5-9-10-9z" /></svg>; }
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

function HeaderTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-colors ${
        active
          ? "bg-[var(--terminal-header-active)] text-[var(--terminal-tab-active)]"
          : "text-[var(--terminal-header-text)] hover:text-[var(--terminal-tab-active)]"
      }`}
    >
      {label}
    </button>
  );
}

function ThemePicker({ current, onChange, onClose }: {
  current: TerminalThemeName;
  onChange: (t: TerminalThemeName) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg"
    >
      {terminalThemeNames.map((name) => {
        const colors = getTerminalThemeColors(name);
        return (
          <button
            key={name}
            onClick={() => { onChange(name); onClose(); }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--bg-hover)] ${
              current === name ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
            }`}
          >
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-full border border-[var(--border)]"
              style={{ background: colors?.bg ?? "var(--terminal-bg)" }}
            />
            {name === "default" ? "Default" : name}
          </button>
        );
      })}
    </div>
  );
}

export function TerminalView({ projectName, services, terminalTheme, onTerminalThemeChange }: TerminalViewProps) {
  const [activePane, setActivePane] = useState<number | "all">("all");
  const [outputs, setOutputs] = useState<string[]>([]);
  const [fontSize, setFontSize] = useState(() => getSettings().terminalFontSize || 12);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const paneRefs = useRef<(PaneHandle | null)[]>([]);
  const paneScrollState = useRef<Record<number, boolean>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const prevOutputs = useRef<string[]>([]);
  const activePaneRef = useRef(activePane);

  activePaneRef.current = activePane;

  const servicesKey = useMemo(
    () => services.map((s) => s.name).join(","),
    [services]
  );
  const stableServices = useMemo(() => services, [servicesKey]);

  const showAll = activePane === "all";
  const hasMultiple = stableServices.length > 1;

  const { containerStyle, xtermTheme } = useMemo(() => {
    const colors = getTerminalThemeColors(terminalTheme);
    if (!colors) return { containerStyle: undefined, xtermTheme: null };
    return {
      containerStyle: terminalThemeCssVars(colors) as React.CSSProperties,
      xtermTheme: { background: colors.bg, foreground: colors.fg, selectionBackground: colors.selection, cursor: colors.cursor } as ITheme,
    };
  }, [terminalTheme]);

  const getActivePane = useCallback((): PaneHandle | null => {
    const ap = activePaneRef.current;
    if (ap === "all") return paneRefs.current[0] ?? null;
    return paneRefs.current[ap] ?? null;
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
  }, [getActivePane]);

  const persistFontSize = useCallback((size: number) => {
    const s = getSettings();
    if (s.terminalFontSize !== size) saveSettings({ ...s, terminalFontSize: size });
  }, []);

  const zoomIn = useCallback(() => setFontSize((s) => { const n = Math.min(s + 1, 24); persistFontSize(n); return n; }), [persistFontSize]);
  const zoomOut = useCallback(() => setFontSize((s) => { const n = Math.max(s - 1, 8); persistFontSize(n); return n; }), [persistFontSize]);

  const forActivePanes = useCallback((fn: (p: PaneHandle) => void) => {
    if (activePaneRef.current === "all") {
      paneRefs.current.forEach((p) => p && fn(p));
    } else {
      const p = paneRefs.current[activePaneRef.current];
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

    if (!streaming) {
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
      poll();
      pollInterval = setInterval(poll, 1000);
    }

    return () => {
      if (eventCleanup) eventCleanup();
      if (pollInterval) clearInterval(pollInterval);
      try { StopLogStreaming(projectName).catch(() => {}); } catch {}
    };
  }, [projectName, stableServices]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

  const handleSearch = (direction: "next" | "prev") => {
    if (!searchQuery) return;
    const pane = getActivePane();
    if (!pane) return;
    direction === "next" ? pane.findNext(searchQuery) : pane.findPrevious(searchQuery);
  };

  const handlePaneScroll = (index: number, isAtBottom: boolean) => {
    paneScrollState.current[index] = isAtBottom;
    let anyUp = false;
    for (let j = 0; j < stableServices.length; j++) {
      const vis = showAll || activePane === j;
      if (vis && paneScrollState.current[j] === false) {
        anyUp = true;
        break;
      }
    }
    setAtBottom(!anyUp);
  };

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--terminal-bg)]"
          : "flex flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)]"
      }
      style={containerStyle}
    >
      <div className={`flex items-center gap-0.5 bg-[var(--terminal-header)] py-1.5 ${fullscreen ? "pl-20 pr-3" : "rounded-t-lg px-3"}`}>
        <div className="flex items-center gap-0.5">
          {hasMultiple && (
            <HeaderTab label="All" active={showAll} onClick={() => setActivePane("all")} />
          )}
          {stableServices.map((svc, i) => (
            <HeaderTab key={svc.name} label={svc.name} active={activePane === i} onClick={() => setActivePane(i)} />
          ))}
        </div>

        <div className="flex-1" />

        <div className="relative flex items-center gap-0.5">
          <IconBtn onClick={zoomOut} title="Zoom out"><MinusIcon /></IconBtn>
          <span className="min-w-[1.25rem] text-center font-mono text-[10px] tabular-nums text-[var(--terminal-header-text)]">
            {fontSize}
          </span>
          <IconBtn onClick={zoomIn} title="Zoom in"><PlusIcon /></IconBtn>
          <div className="mx-1 h-3.5 w-px bg-[var(--terminal-header-hover)]" />
          <IconBtn onClick={() => setShowThemePicker((v) => !v)} title="Terminal theme" active={showThemePicker}><PaletteIcon /></IconBtn>
          <IconBtn onClick={toggleSearch} title="Search (Cmd+F)" active={showSearch}><SearchIcon /></IconBtn>
          <IconBtn onClick={() => forActivePanes((p) => p.clear())} title="Clear"><TrashIcon /></IconBtn>
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
          {showThemePicker && (
            <ThemePicker
              current={terminalTheme}
              onChange={onTerminalThemeChange}
              onClose={() => setShowThemePicker(false)}
            />
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

      <div className={`flex flex-1 overflow-hidden ${showAll && hasMultiple ? "divide-x divide-[var(--border)]" : ""}`}>
        {stableServices.map((svc, i) => {
          const visible = showAll || activePane === i;
          return (
            <div
              key={svc.name}
              className={visible ? "flex flex-1 flex-col overflow-hidden" : "hidden"}
            >
              <Pane
                ref={(el) => { paneRefs.current[i] = el; }}
                label={showAll && hasMultiple ? svc.name : undefined}
                output={outputs[i] || ""}
                visible={visible}
                fontSize={fontSize}
                themeOverride={xtermTheme}
                onScrollStateChange={(ab) => handlePaneScroll(i, ab)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
