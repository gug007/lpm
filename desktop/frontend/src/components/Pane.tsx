import {
  useRef,
  useEffect,
  useState,
  useImperativeHandle,
  useCallback,
  forwardRef,
} from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "@xterm/xterm/css/xterm.css";

export interface PaneHandle {
  clear: () => void;
}

function getTerminalTheme() {
  const isDark =
    document.documentElement.getAttribute("data-theme") !== "light";
  return isDark
    ? {
        background: "#0d0d0d",
        foreground: "#cccccc",
        cursor: "#cccccc",
        selectionBackground: "#444444",
      }
    : {
        background: "#fafafa",
        foreground: "#1a1a1a",
        cursor: "#1a1a1a",
        selectionBackground: "#d0d0d0",
      };
}

interface PaneProps {
  label?: string;
  output: string;
  visible?: boolean;
}

export const Pane = forwardRef<PaneHandle, PaneProps>(function Pane(
  { label, output, visible = true },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const prevLinesRef = useRef<string[]>([]);
  const isAtBottomRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [fontSize, setFontSize] = useState(12);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    clear: () => {
      termRef.current?.reset();
      prevLinesRef.current = [];
    },
  }));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      fontSize,
      fontFamily: "'SF Mono', Menlo, Monaco, 'Courier New', monospace",
      cursorBlink: false,
      disableStdin: true,
      convertEol: true,
      scrollback: 5000,
      theme: getTerminalTheme(),
    });

    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);

    try { term.loadAddon(new WebLinksAddon()); } catch {}
    try {
      const unicode11 = new Unicode11Addon();
      term.loadAddon(unicode11);
      term.unicode.activeVersion = "11";
    } catch {}

    term.open(el);
    termRef.current = term;
    fitRef.current = fit;
    searchRef.current = search;

    try { fit.fit(); } catch {}

    term.onSelectionChange(() => {
      const selection = term.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection).catch(() => {});
      }
    });

    term.onScroll(() => {
      const buf = term.buffer.active;
      const atBottom = buf.viewportY >= buf.baseY;
      if (isAtBottomRef.current !== atBottom) {
        isAtBottomRef.current = atBottom;
        setIsAtBottom(atBottom);
      }
    });

    const mo = new MutationObserver(() => {
      term.options.theme = getTerminalTheme();
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch {}
    });
    ro.observe(el);

    return () => {
      mo.disconnect();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {}
      try {
        term.refresh(0, term.rows - 1);
      } catch {}
    });
  }, [visible]);

  useEffect(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    term.options.fontSize = fontSize;
    try {
      fit.fit();
    } catch {}
  }, [fontSize]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setFontSize((s) => Math.min(s + 1, 24));
      } else if (e.key === "-") {
        e.preventDefault();
        setFontSize((s) => Math.max(s - 1, 8));
      } else if (e.key === "0") {
        e.preventDefault();
        setFontSize(12);
      } else if (e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const wasAtBottom = isAtBottomRef.current;

    const newLines = output ? output.split("\n") : [];
    const prevLines = prevLinesRef.current;
    prevLinesRef.current = newLines;

    if (newLines.length === 0) return;

    if (prevLines.length === 0) {
      term.write(newLines.join("\n"));
      if (wasAtBottom) term.scrollToBottom();
      return;
    }

    const matchCount = Math.min(3, prevLines.length);
    const tailPrev = prevLines.slice(-matchCount);
    let overlapIdx = -1;
    outer: for (let i = newLines.length - matchCount; i >= 0; i--) {
      for (let j = 0; j < matchCount; j++) {
        if (newLines[i + j] !== tailPrev[j]) continue outer;
      }
      overlapIdx = i + matchCount - 1;
      break;
    }

    if (overlapIdx >= 0 && overlapIdx < newLines.length - 1) {
      const added = newLines.slice(overlapIdx + 1);
      term.write("\n" + added.join("\n"));
    } else if (overlapIdx === -1) {
      term.reset();
      term.write(newLines.join("\n"));
    }

    if (wasAtBottom) term.scrollToBottom();
  }, [output]);

  const handleSearchClose = useCallback(() => {
    setShowSearch(false);
    setSearchQuery("");
    searchRef.current?.clearDecorations();
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (value) {
      searchRef.current?.findNext(value, { incremental: true });
    } else {
      searchRef.current?.clearDecorations();
    }
  }, []);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {label && (
        <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1">
          <span className="text-[10px] font-medium text-[var(--text-muted)]">
            {label}
          </span>
        </div>
      )}
      <div ref={containerRef} className="flex-1 overflow-hidden" />

      {showSearch && (
        <div className="absolute right-2 top-1 z-10 flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 shadow-lg">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") handleSearchClose();
              if (e.key === "Enter") {
                e.shiftKey
                  ? searchRef.current?.findPrevious(searchQuery)
                  : searchRef.current?.findNext(searchQuery);
              }
            }}
            className="w-40 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-primary)] outline-none"
            placeholder="Search..."
          />
          <button
            onClick={() => searchRef.current?.findPrevious(searchQuery)}
            className="px-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            ▲
          </button>
          <button
            onClick={() => searchRef.current?.findNext(searchQuery)}
            className="px-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            ▼
          </button>
          <button
            onClick={handleSearchClose}
            className="px-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            ✕
          </button>
        </div>
      )}

      {!isAtBottom && (
        <button
          onClick={() => {
            termRef.current?.scrollToBottom();
            isAtBottomRef.current = true;
            setIsAtBottom(true);
          }}
          className="absolute bottom-4 right-4 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] text-[12px] text-[var(--text-muted)] shadow-lg hover:text-[var(--text-primary)]"
          title="Scroll to bottom"
        >
          ↓
        </button>
      )}
    </div>
  );
});
