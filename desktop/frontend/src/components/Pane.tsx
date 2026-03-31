import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";
import "@xterm/xterm/css/xterm.css";

export interface PaneHandle {
  clear: () => void;
  findNext: (query: string) => boolean;
  findPrevious: (query: string) => boolean;
  clearSearch: () => void;
  scrollToBottom: () => void;
}

interface PaneProps {
  label?: string;
  output: string;
  visible?: boolean;
  fontSize?: number;
  onScrollStateChange?: (atBottom: boolean) => void;
}

function getTerminalTheme() {
  const style = getComputedStyle(document.documentElement);
  return {
    background: style.getPropertyValue("--terminal-bg").trim() || "#0d0d0d",
    foreground: style.getPropertyValue("--terminal-fg").trim() || "#cccccc",
    selectionBackground: style.getPropertyValue("--terminal-selection").trim() || "#444444",
    cursor: style.getPropertyValue("--terminal-cursor").trim() || "#cccccc",
  };
}

export const Pane = forwardRef<PaneHandle, PaneProps>(
  function Pane({ label, output, visible = true, fontSize = 12, onScrollStateChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const searchRef = useRef<SearchAddon | null>(null);
    const prevLinesRef = useRef<string[]>([]);
    const stickToBottomRef = useRef(true);
    const scrollCallbackRef = useRef(onScrollStateChange);
    scrollCallbackRef.current = onScrollStateChange;

    useImperativeHandle(ref, () => ({
      clear() {
        const term = termRef.current;
        if (term) {
          term.reset();
          prevLinesRef.current = [];
        }
      },
      findNext(query: string) {
        return searchRef.current?.findNext(query) ?? false;
      },
      findPrevious(query: string) {
        return searchRef.current?.findPrevious(query) ?? false;
      },
      clearSearch() {
        searchRef.current?.clearDecorations();
      },
      scrollToBottom() {
        const term = termRef.current;
        if (term) {
          term.scrollToBottom();
          stickToBottomRef.current = true;
          scrollCallbackRef.current?.(true);
        }
      },
    }));

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const theme = getTerminalTheme();
      const term = new Terminal({
        fontSize,
        fontFamily: "'SF Mono', Menlo, Monaco, 'Courier New', monospace",
        cursorBlink: false,
        disableStdin: true,
        convertEol: true,
        scrollback: 10000,
        theme: {
          background: theme.background,
          foreground: theme.foreground,
          selectionBackground: theme.selectionBackground,
          cursor: theme.cursor,
        },
      });

      const fit = new FitAddon();
      term.loadAddon(fit);

      try { const s = new SearchAddon(); term.loadAddon(s); searchRef.current = s; } catch {}
      try { term.loadAddon(new WebLinksAddon((_e, uri) => BrowserOpenURL(uri))); } catch {}
      try { const u = new Unicode11Addon(); term.loadAddon(u); term.unicode.activeVersion = "11"; } catch {}

      term.open(el);
      termRef.current = term;
      fitRef.current = fit;

      try { fit.fit(); } catch {}

      term.onScroll(() => {
        const buf = term.buffer.active;
        const atBottom = buf.baseY + term.rows >= buf.length;
        stickToBottomRef.current = atBottom;
        scrollCallbackRef.current?.(atBottom);
      });

      const handleMouseUp = () => {
        const selection = term.getSelection();
        if (selection) navigator.clipboard.writeText(selection).catch(() => {});
      };
      el.addEventListener("mouseup", handleMouseUp);

      const themeObserver = new MutationObserver(() => {
        term.options.theme = getTerminalTheme();
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });

      const ro = new ResizeObserver(() => {
        try { fit.fit(); } catch {}
      });
      ro.observe(el);

      return () => {
        el.removeEventListener("mouseup", handleMouseUp);
        themeObserver.disconnect();
        ro.disconnect();
        term.dispose();
        termRef.current = null;
        fitRef.current = null;
        searchRef.current = null;
      };
    }, []);

    useEffect(() => {
      const term = termRef.current;
      const fit = fitRef.current;
      if (term && fit) {
        term.options.fontSize = fontSize;
        try { fit.fit(); } catch {}
      }
    }, [fontSize]);

    useEffect(() => {
      if (!visible) return;
      const term = termRef.current;
      const fit = fitRef.current;
      if (!term || !fit) return;
      requestAnimationFrame(() => {
        try { fit.fit(); } catch {}
        try { term.refresh(0, term.rows - 1); } catch {}
      });
    }, [visible]);

    useEffect(() => {
      const term = termRef.current;
      if (!term) return;

      const newLines = output ? output.split("\n") : [];
      const prevLines = prevLinesRef.current;
      prevLinesRef.current = newLines;

      if (newLines.length === 0) return;

      const wasStuck = stickToBottomRef.current;
      const prevBaseY = term.buffer.active.baseY;

      if (prevLines.length === 0) {
        term.write(newLines.join("\n"));
      } else {
        const lastPrev = prevLines[prevLines.length - 1];
        let overlapIdx = -1;
        for (let i = newLines.length - 1; i >= 0; i--) {
          if (newLines[i] === lastPrev) {
            overlapIdx = i;
            break;
          }
        }

        if (overlapIdx >= 0 && overlapIdx < newLines.length - 1) {
          const added = newLines.slice(overlapIdx + 1);
          term.write("\n" + added.join("\n"));
        } else if (overlapIdx === -1) {
          term.reset();
          term.write(newLines.join("\n"));
        }
      }

      if (!wasStuck) {
        term.scrollToLine(prevBaseY);
      }
    }, [output]);

    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {label && (
          <div className="border-b border-[var(--terminal-header-hover)] bg-[var(--terminal-header)] px-3 py-0.5">
            <span className="font-mono text-[10px] font-medium text-[var(--terminal-header-text)]">
              {label}
            </span>
          </div>
        )}
        <div ref={containerRef} className="flex-1 overflow-hidden" />
      </div>
    );
  }
);
