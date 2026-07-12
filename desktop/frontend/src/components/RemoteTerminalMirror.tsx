import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { getTerminalTheme, openTerminalLink, TERMINAL_FONT_FAMILY } from "./terminal-utils";
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

// A view of one remote terminal. It always renders the live stream (read-only by
// default); "Take control" claims ownership, which enables input and makes this
// pane the size authority. Ownership state comes from the peers store (control /
// seed frames); the terminal instance is never recreated on an ownership change,
// so scrollback survives handing control back and forth.
export function RemoteTerminalMirror({ peerId, terminal }: { peerId: string; terminal: RemoteTerminal }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ownerRef = useRef(false);
  const remoteSizeRef = useRef<{ cols: number; rows: number } | null>(
    terminal.cols > 0 && terminal.rows > 0 ? { cols: terminal.cols, rows: terminal.rows } : null,
  );
  const [exited, setExited] = useState(false);

  const owner = usePeersStore((s) => s.controlByPeer[peerId]?.[terminal.id] ?? null);
  const isOwner = isSelfOwner(owner, peerId);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setExited(false);

    const term = new Terminal({
      fontSize: 12,
      fontFamily: TERMINAL_FONT_FAMILY,
      cursorBlink: false,
      disableStdin: true,
      scrollback: 10000,
      theme: getTerminalTheme(el),
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

    // Input flows only while we own the terminal. onData carries UTF-8 text
    // (verbatim); onBinary carries raw bytes, HEX-framed for the desktop.
    const onData = term.onData((d) => {
      if (ownerRef.current) void PeerSend(peerId, { t: "in", id: terminal.id, d: encodeTerminalInput(d) });
    });
    const onBinary = term.onBinary((d) => {
      if (ownerRef.current) void PeerSend(peerId, { t: "in", id: terminal.id, d: encodeTerminalInput(d, true) });
    });

    // Decode to bytes before writing: a JS string re-decodes surrogate halves
    // split across chunks into U+FFFD (the mobile-client lesson).
    const write = (s: string) => term.write(encoder.encode(s));

    // Attach before subscribing so the seed frame is never missed.
    const off = EventsOn("peer-frame", (m: PeerFrameEvent) => {
      if (!m || m.peerId !== peerId || m.frame?.id !== terminal.id) return;
      const f = m.frame;
      if (f.t === "seed") {
        term.reset();
        if (f.cols && f.rows) {
          remoteSizeRef.current = { cols: f.cols, rows: f.rows };
          // While we own the terminal we are the size authority — ignore the
          // remote geometry to avoid a resize feedback loop.
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

    // Subscribe read-only (view:true): watch output without taking control, so
    // the controlled Mac keeps ownership until the user clicks Take control.
    void PeerSend(peerId, { t: "sub", id: terminal.id, view: true });

    const themeObserver = new MutationObserver(() => {
      term.options.theme = getTerminalTheme(el);
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

  // React to ownership: gate stdin, and switch the size authority. As owner we
  // fit the pane and push resizes; otherwise we follow the remote geometry.
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
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1 text-[11px] text-[var(--text-muted)]">
        {isOwner ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-green)]" />
            <span className="text-[var(--text-secondary)]">You're in control</span>
          </>
        ) : (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-amber)]" />
            <span>Viewing — read-only</span>
            <button
              onClick={() => void PeerSend(peerId, { t: "claim", id: terminal.id })}
              className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              Take control
            </button>
          </>
        )}
        {exited && <span className="ml-2 text-[var(--text-muted)]">· session ended</span>}
      </div>
      <div ref={containerRef} className="min-h-0 min-w-0 flex-1 overflow-auto bg-[var(--terminal-bg)] p-1" />
    </div>
  );
}
