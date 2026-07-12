import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { getTerminalTheme, openTerminalLink, TERMINAL_FONT_FAMILY, ansiColors } from "./terminal-utils";
import { getTerminalThemeColors } from "../terminal-themes";
import { useTerminalTheme } from "../hooks/useTerminalTheme";
import { useTerminalFontSize } from "../hooks/useTerminalFontSize";
import { PeerSend } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import { usePeersStore, isSelfOwner, type RemoteTerminal } from "../store/peers";
import { encodeTerminalInput } from "../remoteInput";
import "@xterm/xterm/css/xterm.css";

interface PeerFrameEvent {
  peerId: string;
  frame: { t?: string; id?: string; d?: string; data?: string; cols?: number; rows?: number };
}

const encoder = new TextEncoder();

// A view of one remote terminal, rendered on a surface identical to the local
// terminal (same fontFamily/theme/scrollback, settings-driven font size, no
// padding, edge-to-edge background). Read-only by default; "Take control" claims
// ownership, enabling input and making this pane the size authority. The terminal
// instance is never recreated on an ownership/font/theme change, so scrollback
// survives handing control back and forth.
export function RemoteTerminalMirror({ peerId, terminal }: { peerId: string; terminal: RemoteTerminal }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ownerRef = useRef(false);
  const remoteSizeRef = useRef<{ cols: number; rows: number } | null>(
    terminal.cols > 0 && terminal.rows > 0 ? { cols: terminal.cols, rows: terminal.rows } : null,
  );
  const [exited, setExited] = useState(false);

  const { theme: themeName, themeStyle } = useTerminalTheme();
  const { fontSize } = useTerminalFontSize();
  const xtermTheme = useMemo<ITheme | null>(() => {
    const colors = getTerminalThemeColors(themeName);
    if (!colors) return null;
    return {
      background: colors.bg,
      foreground: colors.fg,
      selectionBackground: colors.selection,
      cursor: colors.cursor,
      ...ansiColors,
    };
  }, [themeName]);

  const xtermThemeRef = useRef(xtermTheme);
  xtermThemeRef.current = xtermTheme;

  const owner = usePeersStore((s) => s.controlByPeer[peerId]?.[terminal.id] ?? null);
  const isOwner = isSelfOwner(owner, peerId);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setExited(false);

    const term = new Terminal({
      fontSize,
      fontFamily: TERMINAL_FONT_FAMILY,
      cursorBlink: false,
      disableStdin: true,
      scrollback: 10000,
      allowProposedApi: true,
      theme: xtermTheme ?? getTerminalTheme(el),
      linkHandler: { activate: openTerminalLink },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    try {
      term.loadAddon(new WebLinksAddon(openTerminalLink));
    } catch {
      /* addon optional */
    }
    try {
      const u = new Unicode11Addon();
      term.loadAddon(u);
      term.unicode.activeVersion = "11";
    } catch {
      /* addon optional */
    }
    term.open(el);
    termRef.current = term;
    fitRef.current = fit;
    if (remoteSizeRef.current) {
      try {
        term.resize(remoteSizeRef.current.cols, remoteSizeRef.current.rows);
      } catch {
        /* ignore bad geometry */
      }
    }

    const onData = term.onData((d) => {
      if (ownerRef.current) void PeerSend(peerId, { t: "in", id: terminal.id, d: encodeTerminalInput(d) });
    });
    const onBinary = term.onBinary((d) => {
      if (ownerRef.current) void PeerSend(peerId, { t: "in", id: terminal.id, d: encodeTerminalInput(d, true) });
    });

    // Decode to bytes before writing: a JS string re-decodes surrogate halves
    // split across chunks into U+FFFD (the mobile-client lesson).
    const write = (s: string) => term.write(encoder.encode(s));

    const off = EventsOn("peer-frame", (m: PeerFrameEvent) => {
      if (!m || m.peerId !== peerId || m.frame?.id !== terminal.id) return;
      const f = m.frame;
      if (f.t === "seed") {
        term.reset();
        if (f.cols && f.rows) {
          remoteSizeRef.current = { cols: f.cols, rows: f.rows };
          if (!ownerRef.current) {
            try {
              term.resize(f.cols, f.rows);
            } catch {
              /* ignore */
            }
          }
        }
        if (f.data) write(f.data);
      } else if (f.t === "o") {
        if (f.d) write(f.d);
      } else if (f.t === "exit") {
        setExited(true);
      }
    });

    void PeerSend(peerId, { t: "sub", id: terminal.id, view: true });

    const themeObserver = new MutationObserver(() => {
      term.options.theme = xtermThemeRef.current ?? getTerminalTheme(el);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      off();
      onData.dispose();
      onBinary.dispose();
      themeObserver.disconnect();
      void PeerSend(peerId, { t: "unsub", id: terminal.id });
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [peerId, terminal.id]);

  // Push live font-size / theme changes onto the existing terminal without
  // recreating it (mirrors the local pane's option updates).
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    if (ownerRef.current) {
      try {
        fitRef.current?.fit();
      } catch {
        /* ignore */
      }
    }
  }, [fontSize]);
  useEffect(() => {
    const term = termRef.current;
    const el = containerRef.current;
    if (term) term.options.theme = xtermTheme ?? getTerminalTheme(el);
  }, [xtermTheme]);

  useEffect(() => {
    ownerRef.current = isOwner;
    const term = termRef.current;
    const fit = fitRef.current;
    const el = containerRef.current;
    if (!term) return;
    term.options.disableStdin = !isOwner;

    if (!isOwner) {
      const s = remoteSizeRef.current;
      if (s) {
        try {
          term.resize(s.cols, s.rows);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    term.focus();
    let timer = 0;
    const fitAndSend = () => {
      if (!el || !el.clientWidth || !el.clientHeight) return;
      try {
        fit?.fit();
      } catch {
        return;
      }
      void PeerSend(peerId, { t: "resize", id: terminal.id, cols: term.cols, rows: term.rows });
    };
    fitAndSend();
    const ro = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(fitAndSend, 150);
    });
    if (el) ro.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      ro.disconnect();
    };
  }, [isOwner, peerId, terminal.id]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--terminal-bg)]" style={themeStyle}>
      <div className="pointer-events-none absolute right-2 top-1.5 z-10 flex items-center gap-1.5">
        {isOwner ? (
          <span className="pointer-events-auto flex items-center gap-1 rounded-full bg-[var(--bg-secondary)]/85 px-2 py-0.5 text-[10px] text-[var(--text-muted)] backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-green)]" />
            In control
          </span>
        ) : (
          <span className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-[var(--bg-secondary)]/85 px-2 py-0.5 text-[10px] text-[var(--text-muted)] backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-amber)]" />
            Viewing
            <button
              onClick={() => void PeerSend(peerId, { t: "claim", id: terminal.id })}
              className="text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              Take control
            </button>
          </span>
        )}
        {exited && (
          <span className="pointer-events-none rounded-full bg-[var(--bg-secondary)]/85 px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
            ended
          </span>
        )}
      </div>
      <div ref={containerRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden" />
    </div>
  );
}
