import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { GetServiceLogs, StartLogStreaming, StopLogStreaming } from "../../wailsjs/go/main/App";
import { Pane, PaneHandle } from "./Pane";
import { TabButton } from "./TabButton";

const toolbarBtn =
  "rounded px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]";

interface TerminalViewProps {
  projectName: string;
  services: { name: string }[];
}

export function TerminalView({ projectName, services }: TerminalViewProps) {
  const [activePane, setActivePane] = useState<number | "all">("all");
  const [outputs, setOutputs] = useState<string[]>([]);
  const [fontSize, setFontSize] = useState(12);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const paneRefs = useRef<(PaneHandle | null)[]>([]);
  const paneScrollState = useRef<Record<number, boolean>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const prevOutputs = useRef<string[]>([]);
  const showSearchRef = useRef(showSearch);
  const activePaneRef = useRef(activePane);

  showSearchRef.current = showSearch;
  activePaneRef.current = activePane;

  const servicesKey = useMemo(
    () => services.map((s) => s.name).join(","),
    [services]
  );
  const stableServices = useMemo(() => services, [servicesKey]);

  const showAll = activePane === "all";
  const hasMultiple = stableServices.length > 1;

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

  const zoomIn = useCallback(() => setFontSize((s) => Math.min(s + 1, 24)), []);
  const zoomOut = useCallback(() => setFontSize((s) => Math.max(s - 1, 8)), []);

  const forActivePanes = useCallback((fn: (p: PaneHandle) => void) => {
      if (activePaneRef.current === "all") {
        paneRefs.current.forEach((p) => p && fn(p));
      } else {
        const p = paneRefs.current[activePaneRef.current];
        if (p) fn(p);
      }
    },
    []
  );

  // Try event-based streaming; fall back to polling if unavailable
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
              GetServiceLogs(projectName, i, 100).catch(() => "(no output)")
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

  // Keyboard shortcuts — uses refs to avoid re-registration on state changes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key === "f") { e.preventDefault(); toggleSearch(); }
      if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoomIn(); }
      if (mod && e.key === "-") { e.preventDefault(); zoomOut(); }

      if (e.key === "Escape" && showSearchRef.current) {
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
    <div className="flex flex-1 flex-col overflow-hidden border-t border-[var(--border)]">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1">
        {hasMultiple && (
          <TabButton label="all" active={showAll} onClick={() => setActivePane("all")} />
        )}
        {stableServices.map((svc, i) => (
          <TabButton
            key={svc.name}
            label={svc.name}
            active={activePane === i}
            onClick={() => setActivePane(i)}
          />
        ))}

        <div className="flex-1" />

        <button onClick={zoomOut} className={toolbarBtn} title="Decrease font size">A-</button>
        <span className="min-w-[1.5rem] text-center text-[10px] tabular-nums text-[var(--text-muted)]">{fontSize}</span>
        <button onClick={zoomIn} className={toolbarBtn} title="Increase font size">A+</button>

        <div className="mx-1 h-3 w-px bg-[var(--border)]" />

        <button
          onClick={toggleSearch}
          className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
            showSearch
              ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
          }`}
          title="Search (Cmd+F)"
        >
          Search
        </button>

        <button
          onClick={() => forActivePanes((p) => p.clear())}
          className={toolbarBtn}
          title="Clear terminal"
        >
          Clear
        </button>

        {!atBottom && (
          <button
            onClick={() => {
              forActivePanes((p) => p.scrollToBottom());
              paneScrollState.current = {};
              setAtBottom(true);
            }}
            className="ml-1 rounded bg-[var(--accent-cyan)] px-2 py-0.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
            title="Scroll to bottom"
          >
            ↓ Bottom
          </button>
        )}
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-1.5 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearch(e.shiftKey ? "prev" : "next");
              }
              if (e.key === "Escape") closeSearch();
            }}
            placeholder="Search logs..."
            className="w-52 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-0.5 text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)]"
          />
          <button onClick={() => handleSearch("prev")} className={toolbarBtn} title="Previous match (Shift+Enter)">↑</button>
          <button onClick={() => handleSearch("next")} className={toolbarBtn} title="Next match (Enter)">↓</button>
          <button onClick={closeSearch} className={toolbarBtn} title="Close search (Escape)">✕</button>
        </div>
      )}

      {/* Terminal panes */}
      <div
        className={`flex flex-1 overflow-hidden ${showAll && hasMultiple ? "divide-x divide-[var(--border)]" : ""}`}
      >
        {stableServices.map((svc, i) => {
          const visible = showAll || activePane === i;
          return (
            <div
              key={svc.name}
              className={visible ? "flex flex-1 flex-col overflow-hidden" : "hidden"}
            >
              <Pane
                ref={(el) => {
                  paneRefs.current[i] = el;
                }}
                label={showAll && hasMultiple ? svc.name : undefined}
                output={outputs[i] || ""}
                visible={visible}
                fontSize={fontSize}
                onScrollStateChange={(ab) => handlePaneScroll(i, ab)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
