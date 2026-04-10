import { useRef, useEffect, useImperativeHandle, type Ref, type ReactNode } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";
import { getTerminalTheme } from "./terminal-utils";
import { ChevronRightIcon } from "./icons";
import "@xterm/xterm/css/xterm.css";

const labelBarClass = "flex items-center justify-between gap-1 border-b border-[var(--terminal-header-hover)] bg-[var(--terminal-header)] px-3 py-0.5 font-mono text-[10px] font-medium text-[var(--terminal-header-text)]";

// A session owns the xterm Terminal and the DOM element it's attached to.
// Sessions survive Pane remounts (e.g. splitting reshuffles the React
// tree) so scrollback and selection aren't lost. Callers that set
// sessionKey are responsible for disposal via disposePaneSession.
interface PaneSession {
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon | null;
  host: HTMLDivElement;
  prevLines: string[];
  stickToBottom: boolean;
  onScrollState?: (atBottom: boolean) => void;
}

const paneSessions = new Map<string, PaneSession>();

function createPaneSession(opts: { fontSize: number; theme: ITheme }): PaneSession {
  const host = document.createElement("div");
  host.className = "absolute inset-0 overflow-hidden";

  const term = new Terminal({
    fontSize: opts.fontSize,
    fontFamily: "'SF Mono', Menlo, Monaco, 'Courier New', monospace",
    cursorBlink: false,
    disableStdin: true,
    convertEol: true,
    scrollback: 10000,
    theme: opts.theme,
  });

  const fit = new FitAddon();
  term.loadAddon(fit);

  let search: SearchAddon | null = null;
  try { search = new SearchAddon(); term.loadAddon(search); } catch {}
  try { term.loadAddon(new WebLinksAddon((_e, uri) => BrowserOpenURL(uri))); } catch {}
  try { const u = new Unicode11Addon(); term.loadAddon(u); term.unicode.activeVersion = "11"; } catch {}

  term.open(host);

  const session: PaneSession = {
    term,
    fit,
    search,
    host,
    prevLines: [],
    stickToBottom: true,
  };

  term.onScroll(() => {
    const buf = term.buffer.active;
    const atBottom = buf.baseY + term.rows >= buf.length;
    session.stickToBottom = atBottom;
    session.onScrollState?.(atBottom);
  });

  return session;
}

export function disposePaneSession(key: string): void {
  const session = paneSessions.get(key);
  if (!session) return;
  session.term.dispose();
  session.host.remove();
  paneSessions.delete(key);
}

export interface PaneHandle {
  clear: () => void;
  findNext: (query: string) => boolean;
  findPrevious: (query: string) => boolean;
  clearSearch: () => void;
  scrollToBottom: () => void;
  focus: () => void;
}

interface PaneProps {
  label?: string;
  onLabelClick?: () => void;
  labelActions?: ReactNode;
  output: string;
  visible?: boolean;
  fontSize?: number;
  onScrollStateChange?: (atBottom: boolean) => void;
  themeOverride?: ITheme | null;
  sessionKey?: string;
  ref?: Ref<PaneHandle>;
}

export function Pane({ label, onLabelClick, labelActions, output, visible = true, fontSize = 12, onScrollStateChange, themeOverride, sessionKey, ref }: PaneProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sessionRef = useRef<PaneSession | null>(null);
    const scrollCallbackRef = useRef(onScrollStateChange);
    const themeOverrideRef = useRef(themeOverride);
    scrollCallbackRef.current = onScrollStateChange;
    themeOverrideRef.current = themeOverride;

    useImperativeHandle(ref, () => ({
      clear() {
        const session = sessionRef.current;
        if (!session) return;
        session.term.reset();
        session.prevLines = [];
      },
      findNext(query: string) {
        return sessionRef.current?.search?.findNext(query) ?? false;
      },
      findPrevious(query: string) {
        return sessionRef.current?.search?.findPrevious(query) ?? false;
      },
      clearSearch() {
        sessionRef.current?.search?.clearDecorations();
      },
      scrollToBottom() {
        const session = sessionRef.current;
        if (!session) return;
        session.term.scrollToBottom();
        session.stickToBottom = true;
        scrollCallbackRef.current?.(true);
      },
      focus() {
        sessionRef.current?.term.focus();
      },
    }));

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const initialTheme = themeOverrideRef.current ?? getTerminalTheme(el);

      let session: PaneSession;
      if (sessionKey) {
        const cached = paneSessions.get(sessionKey);
        if (cached) {
          session = cached;
        } else {
          session = createPaneSession({ fontSize, theme: initialTheme });
          paneSessions.set(sessionKey, session);
        }
      } else {
        session = createPaneSession({ fontSize, theme: initialTheme });
      }

      sessionRef.current = session;

      // A cached session may have been created earlier with different theme
      // or fontSize — push the current values before attaching.
      session.term.options.fontSize = fontSize;
      session.term.options.theme = initialTheme;

      el.appendChild(session.host);

      session.onScrollState = (atBottom) => {
        scrollCallbackRef.current?.(atBottom);
      };

      try { session.fit.fit(); } catch {}

      const handleMouseUp = () => {
        const selection = session.term.getSelection();
        if (selection) navigator.clipboard.writeText(selection).catch(() => {});
      };
      session.host.addEventListener("mouseup", handleMouseUp);

      const globalObserver = new MutationObserver(() => {
        if (!themeOverrideRef.current) session.term.options.theme = getTerminalTheme(el);
      });
      globalObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });

      let resizeTimer = 0;
      const ro = new ResizeObserver(() => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          resizeTimer = 0;
          if (!session.host.clientWidth || !session.host.clientHeight) return;
          try { session.fit.fit(); } catch {}
        }, 200);
      });
      ro.observe(session.host);

      return () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        session.host.removeEventListener("mouseup", handleMouseUp);
        globalObserver.disconnect();
        ro.disconnect();
        session.onScrollState = undefined;

        if (sessionKey) {
          // Detach host from this mount's container; the cached session
          // (including xterm buffer) stays alive for the next mount.
          if (session.host.parentNode) {
            session.host.parentNode.removeChild(session.host);
          }
        } else {
          session.term.dispose();
          session.host.remove();
        }

        sessionRef.current = null;
      };
    }, [sessionKey]);

    useEffect(() => {
      const session = sessionRef.current;
      if (!session) return;
      session.term.options.theme = themeOverride ?? getTerminalTheme(containerRef.current);
    }, [themeOverride]);

    useEffect(() => {
      const session = sessionRef.current;
      if (!session) return;
      session.term.options.fontSize = fontSize;
      try { session.fit.fit(); } catch {}
    }, [fontSize]);

    useEffect(() => {
      if (!visible) return;
      const session = sessionRef.current;
      if (!session) return;
      requestAnimationFrame(() => {
        try { session.fit.fit(); } catch {}
        try { session.term.refresh(0, session.term.rows - 1); } catch {}
      });
    }, [visible]);

    useEffect(() => {
      const session = sessionRef.current;
      if (!session) return;
      const term = session.term;

      const newLines = output ? output.split("\n") : [];
      const prevLines = session.prevLines;
      session.prevLines = newLines;

      if (newLines.length === 0) return;

      const wasStuck = session.stickToBottom;
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {label && (
          <div className={labelBarClass}>
            {onLabelClick ? (
              <button
                onClick={onLabelClick}
                title={`Open ${label} tab`}
                className="group -ml-1 flex min-w-0 flex-1 items-center gap-1 rounded px-1 text-left transition-colors hover:text-[var(--terminal-tab-active)]"
              >
                <span className="truncate">{label}</span>
                <span className="shrink-0 opacity-50 transition-opacity group-hover:opacity-100">
                  <ChevronRightIcon />
                </span>
              </button>
            ) : (
              <span className="truncate">{label}</span>
            )}
            {labelActions && (
              <span className="flex shrink-0 items-center gap-0.5">{labelActions}</span>
            )}
          </div>
        )}
        <div ref={containerRef} className="relative min-h-0 min-w-0 flex-1" />
      </div>
    );
}
