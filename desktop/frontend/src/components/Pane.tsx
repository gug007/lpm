import { useRef, useEffect, useImperativeHandle, useState, type Ref, type ReactNode } from "react";
import { Terminal, type IDisposable, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { SerializeAddon } from "@xterm/addon-serialize";
import { canFitHost, getTerminalTheme, openTerminalLink } from "./terminal-utils";
import { copyTerminalSelection, handleCopyShortcut, handleNativeCopy, handleSelectAllShortcut, handleClearShortcut } from "./terminal/copySelection";
import { readOnlyTerminalYields } from "./terminal/terminalKeys";
import { applyFilterQuery, FilterMirror, type FilterSpec } from "./terminal/FilterMirror";
import { bufferToPlainText } from "./terminal/consoleActions";
import { EMPTY_TALLY, tallyLines, type SeverityTally } from "./terminal/logSeverity";
import { useServiceLogs } from "../store/serviceLogs";
import { registerPathLinkProvider } from "./terminal/pathLinkProvider";
import { installLinkHoverRefresh } from "./terminal/linkHoverRefresh";
import { useTerminalFont } from "../hooks/useTerminalFont";
import { ChevronRightIcon } from "./icons";
import { ConsoleContextMenu } from "./terminal/ConsoleContextMenu";
import {
  clearFind,
  runFind,
  watchFindResults,
  type FindDirection,
  type FindOptions,
  type FindOutcome,
  type FindResults,
} from "./terminal/terminalFind";
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
  serialize: SerializeAddon | null;
  host: HTMLDivElement;
  prevLines: string[];
  // The pane went away while its output stayed on screen (a restart replaced
  // the session); the next capture belongs to a new pane and starts clean.
  staleBuffer: boolean;
  stickToBottom: boolean;
  cwd: string;
  pathLinkDisposable: IDisposable | null;
  onScrollState?: (atBottom: boolean) => void;
  // Run after the pane is cleared so a live filter overlay refreshes too.
  onAfterClear?: () => void;
  // Errors and warnings written since the session started or was cleared.
  tally: SeverityTally;
  onTally?: (tally: SeverityTally) => void;
}

const paneSessions = new Map<string, PaneSession>();

function createPaneSession(opts: {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  theme: ITheme;
  cwd: string;
}): PaneSession {
  const host = document.createElement("div");
  host.className = "absolute inset-0 overflow-hidden";

  const term = new Terminal({
    fontSize: opts.fontSize,
    fontFamily: opts.fontFamily,
    lineHeight: opts.lineHeight,
    cursorBlink: false,
    disableStdin: true,
    convertEol: true,
    scrollback: 10000,
    theme: opts.theme,
    linkHandler: { activate: openTerminalLink },
  });

  const fit = new FitAddon();
  term.loadAddon(fit);

  let search: SearchAddon | null = null;
  try { search = new SearchAddon(); term.loadAddon(search); } catch {}
  let serialize: SerializeAddon | null = null;
  try { serialize = new SerializeAddon(); term.loadAddon(serialize); } catch {}
  try { term.loadAddon(new WebLinksAddon(openTerminalLink)); } catch {}
  try { const u = new Unicode11Addon(); term.loadAddon(u); term.unicode.activeVersion = "11"; } catch {}

  term.open(host);

  const session: PaneSession = {
    term,
    fit,
    search,
    serialize,
    host,
    prevLines: [],
    staleBuffer: false,
    stickToBottom: true,
    cwd: opts.cwd,
    pathLinkDisposable: null,
    tally: EMPTY_TALLY,
  };

  try {
    session.pathLinkDisposable = registerPathLinkProvider(term, {
      getCwd: () => session.cwd,
    });
  } catch {}

  installLinkHoverRefresh(term, host);

  term.onScroll(() => {
    const buf = term.buffer.active;
    const atBottom = buf.baseY + term.rows >= buf.length;
    session.stickToBottom = atBottom;
    session.onScrollState?.(atBottom);
  });

  term.attachCustomKeyEventHandler((e) => {
    if (handleCopyShortcut(e, term, serialize)) return false;
    if (handleSelectAllShortcut(e, term)) return false;
    if (handleClearShortcut(e, term, { force: true, onClear: () => clearPaneSession(session) })) return false;
    return !readOnlyTerminalYields(e);
  });

  host.addEventListener("copy", (e) => handleNativeCopy(e, term, serialize), true);

  // xterm preventDefaults mousedown without focusing itself, so a selection
  // drag would otherwise leave ⌘C pointed at the previously focused element.
  host.addEventListener("mousedown", () => term.focus());

  return session;
}

function fitPaneSession(session: PaneSession): void {
  if (!canFitHost(session.host)) return;
  try { session.fit.fit(); } catch {}
}

// prevLines stays: the next snapshot still holds everything that was on screen,
// and diffing against it appends only what arrives after the clear instead of
// writing the cleared history back.
function clearPaneSession(session: PaneSession): void {
  session.term.reset();
  session.staleBuffer = false;
  recountPaneSession(session, []);
  session.onAfterClear?.();
}

function recountPaneSession(session: PaneSession, lines: string[], from: SeverityTally = EMPTY_TALLY): void {
  session.tally = tallyLines(lines, from);
  session.onTally?.(session.tally);
}

/** Everything a service's pane holds, as plain text, or "" for no such pane. */
export function paneSessionText(key: string): string {
  const session = paneSessions.get(key);
  return session ? bufferToPlainText(session.term) : "";
}

export function disposePaneSession(key: string): void {
  const session = paneSessions.get(key);
  if (!session) return;
  session.pathLinkDisposable?.dispose();
  session.term.dispose();
  session.host.remove();
  paneSessions.delete(key);
  useServiceLogs.getState().forget(key);
}

export interface PaneHandle {
  clear: () => void;
  find: (query: string, direction: FindDirection, options: FindOptions) => FindOutcome;
  watchFind: (onResults: (results: FindResults) => void) => () => void;
  clearSearch: () => void;
  setFilter: (query: string | null, onCount?: (count: number) => void) => void;
  scrollToBottom: () => void;
  focus: () => void;
}

interface PaneProps {
  label?: string;
  // Before the label (a state dot), and a line added to its link's tooltip
  // (the command the pane runs).
  labelLead?: ReactNode;
  labelHint?: string;
  // After the label, when it isn't a link to the pane's tab.
  labelDetail?: ReactNode;
  onLabelClick?: () => void;
  labelActions?: ReactNode;
  output: string;
  visible?: boolean;
  fontSize?: number;
  onScrollStateChange?: (atBottom: boolean) => void;
  themeOverride?: ITheme | null;
  sessionKey?: string;
  cwd?: string;
  ref?: Ref<PaneHandle>;
}

export function Pane({ label, labelLead, labelHint, labelDetail, onLabelClick, labelActions, output, visible = true, fontSize = 12, onScrollStateChange, themeOverride, sessionKey, cwd = "", ref }: PaneProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sessionRef = useRef<PaneSession | null>(null);
    const filterRef = useRef<FilterMirror | null>(null);
    const { fontFamily, lineHeight } = useTerminalFont();
    const fontSizeRef = useRef(fontSize);
    const fontFamilyRef = useRef(fontFamily);
    const lineHeightRef = useRef(lineHeight);
    const scrollCallbackRef = useRef(onScrollStateChange);
    const themeOverrideRef = useRef(themeOverride);
    fontSizeRef.current = fontSize;
    fontFamilyRef.current = fontFamily;
    lineHeightRef.current = lineHeight;
    scrollCallbackRef.current = onScrollStateChange;
    themeOverrideRef.current = themeOverride;
    const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
    const severityFilter = useServiceLogs((s) => (sessionKey ? s.filter[sessionKey] : undefined));

    const applyFilter = (spec: FilterSpec | null, onCount?: (count: number) => void) => {
      const session = sessionRef.current;
      const el = containerRef.current;
      if (!session || !el) return;
      applyFilterQuery(
        filterRef,
        el,
        session,
        () => themeOverrideRef.current ?? getTerminalTheme(el),
        () => fontSizeRef.current,
        () => ({ fontFamily: fontFamilyRef.current, lineHeight: lineHeightRef.current }),
        spec,
        onCount,
      );
    };

    useImperativeHandle(ref, () => ({
      clear() {
        const session = sessionRef.current;
        if (!session) return;
        clearPaneSession(session);
      },
      find(query: string, direction: FindDirection, options: FindOptions) {
        return runFind(sessionRef.current, query, direction, options);
      },
      watchFind(onResults: (results: FindResults) => void) {
        return watchFindResults(sessionRef.current, onResults);
      },
      clearSearch() {
        clearFind(sessionRef.current);
      },
      setFilter(query: string | null, onCount?: (count: number) => void) {
        if (!sessionRef.current || !containerRef.current) return;
        const logs = useServiceLogs.getState();
        if (query && sessionKey) logs.setFilter(sessionKey, null);
        // With no text to filter by, the pane goes back to its Errors or Warnings view.
        const severity = !query && sessionKey ? logs.filter[sessionKey] : undefined;
        applyFilter(query || (severity ? { severity } : null), onCount);
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
          session = createPaneSession({
            fontSize,
            fontFamily: fontFamilyRef.current,
            lineHeight: lineHeightRef.current,
            theme: initialTheme,
            cwd,
          });
          paneSessions.set(sessionKey, session);
        }
      } else {
        session = createPaneSession({
          fontSize,
          fontFamily: fontFamilyRef.current,
          lineHeight: lineHeightRef.current,
          theme: initialTheme,
          cwd,
        });
      }

      sessionRef.current = session;

      // A cached session may have been created earlier with different theme,
      // font, or cwd — push the current values before attaching.
      session.term.options.fontSize = fontSize;
      session.term.options.fontFamily = fontFamilyRef.current;
      session.term.options.lineHeight = lineHeightRef.current;
      session.term.options.theme = initialTheme;
      session.cwd = cwd;

      el.appendChild(session.host);

      session.onScrollState = (atBottom) => {
        scrollCallbackRef.current?.(atBottom);
      };
      session.onAfterClear = () => filterRef.current?.refresh();
      session.onTally = sessionKey
        ? ({ errors, warnings }) => useServiceLogs.getState().setCounts(sessionKey, { errors, warnings })
        : undefined;
      session.onTally?.(session.tally);

      fitPaneSession(session);

      const handleMouseUp = (e: MouseEvent) => {
        if (e.button !== 0) return;
        copyTerminalSelection(session.term, session.serialize);
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
          fitPaneSession(session);
        }, 200);
      });
      ro.observe(session.host);

      return () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        session.host.removeEventListener("mouseup", handleMouseUp);
        globalObserver.disconnect();
        ro.disconnect();
        session.onScrollState = undefined;
        session.onAfterClear = undefined;
        session.onTally = undefined;
        filterRef.current?.dispose();
        filterRef.current = null;

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
        setMenu(null);
      };
    }, [sessionKey]);

    useEffect(() => {
      const session = sessionRef.current;
      if (!session) return;
      const theme = themeOverride ?? getTerminalTheme(containerRef.current);
      session.term.options.theme = theme;
      filterRef.current?.setTheme(theme);
    }, [themeOverride]);

    useEffect(() => {
      const session = sessionRef.current;
      if (!session) return;
      session.term.options.fontSize = fontSize;
      filterRef.current?.setFontSize(fontSize);
      fitPaneSession(session);
    }, [fontSize]);

    useEffect(() => {
      const session = sessionRef.current;
      if (!session) return;
      session.term.options.fontFamily = fontFamily;
      session.term.options.lineHeight = lineHeight;
      filterRef.current?.setFont(fontFamily, lineHeight);
      fitPaneSession(session);
    }, [fontFamily, lineHeight]);

    useEffect(() => {
      const session = sessionRef.current;
      if (!session) return;
      session.cwd = cwd;
    }, [cwd]);

    useEffect(() => {
      const showing = filterRef.current?.severity() ?? null;
      const wanted = visible ? (severityFilter ?? null) : null;
      if (wanted !== showing) applyFilter(wanted ? { severity: wanted } : null);
    }, [severityFilter, visible]);

    useEffect(() => {
      if (!visible) {
        filterRef.current?.setQuery(null);
        return;
      }
      const session = sessionRef.current;
      if (!session) return;
      requestAnimationFrame(() => {
        fitPaneSession(session);
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

      if (newLines.length === 0) {
        if (prevLines.length > 0) session.staleBuffer = true;
        return;
      }

      const wasStuck = session.stickToBottom;
      const prevBaseY = term.buffer.active.baseY;

      if (prevLines.length === 0) {
        if (session.staleBuffer) term.reset();
        term.write(newLines.join("\n"));
        recountPaneSession(session, newLines, session.staleBuffer ? EMPTY_TALLY : session.tally);
      } else {
        // The capture is trimmed as a whole, so its last line loses trailing
        // spaces it keeps once more output follows; compare without them or a
        // line ending in a space reads as no overlap and rewrites everything.
        const lastPrev = prevLines[prevLines.length - 1].trimEnd();
        let overlapIdx = -1;
        for (let i = newLines.length - 1; i >= 0; i--) {
          if (newLines[i].trimEnd() === lastPrev) {
            overlapIdx = i;
            break;
          }
        }

        if (overlapIdx >= 0 && overlapIdx < newLines.length - 1) {
          const added = newLines.slice(overlapIdx + 1);
          term.write("\n" + added.join("\n"));
          recountPaneSession(session, added, session.tally);
        } else if (overlapIdx === -1) {
          term.reset();
          term.write(newLines.join("\n"));
          recountPaneSession(session, newLines);
        }
      }
      session.staleBuffer = false;

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
                title={labelHint ? `Open ${label} tab\n${labelHint}` : `Open ${label} tab`}
                className="group -ml-1 flex min-w-0 flex-1 items-center gap-1 rounded px-1 text-left transition-colors hover:text-[var(--terminal-tab-active)]"
              >
                {labelLead}
                <span className="truncate">{label}</span>
                <span className="shrink-0 opacity-50 transition-opacity group-hover:opacity-100">
                  <ChevronRightIcon />
                </span>
              </button>
            ) : (
              <span className="flex min-w-0 items-center gap-1">
                {labelLead}
                <span className="truncate">{label}</span>
                {labelDetail}
              </span>
            )}
            {labelActions && (
              <span className="flex shrink-0 items-center gap-0.5">{labelActions}</span>
            )}
          </div>
        )}
        <div
          ref={containerRef}
          onContextMenu={(e) => {
            if (!sessionRef.current) return;
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY });
          }}
          className="relative min-h-0 min-w-0 flex-1"
        />
        {menu && sessionRef.current && (
          <ConsoleContextMenu
            x={menu.x}
            y={menu.y}
            term={sessionRef.current.term}
            serialize={sessionRef.current.serialize}
            canPaste={false}
            filter={filterRef.current}
            onClear={() => {
              const s = sessionRef.current;
              if (s) clearPaneSession(s);
            }}
            onClose={() => setMenu(null)}
          />
        )}
      </div>
    );
}
