import { useRef, useEffect, useImperativeHandle, type Ref } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { EventsOn, BrowserOpenURL, OnFileDrop } from "../../wailsjs/runtime/runtime";
import { ResizeTerminal, AckTerminalData } from "../../wailsjs/go/main/App";
import { sendTerminalInput } from "../terminal-io";
import { getTerminalTheme } from "./terminal-utils";
import "@xterm/xterm/css/xterm.css";

export interface InteractivePaneHandle {
  clear: () => void;
  findNext: (query: string) => boolean;
  findPrevious: (query: string) => boolean;
  clearSearch: () => void;
  scrollToBottom: () => void;
  focus: () => void;
}

interface InteractivePaneProps {
  terminalId: string;
  visible?: boolean;
  fontSize?: number;
  onScrollStateChange?: (atBottom: boolean) => void;
  themeOverride?: ITheme | null;
  onExit?: (exitCode: number) => void;
  ref?: Ref<InteractivePaneHandle>;
}

// Flow control: ack in batches to reduce IPC calls (matches VS Code's approach)
const ACK_SIZE = 5000;
const HIDDEN_BUF_CAP = 1_000_000; // max chars to buffer while hidden (~1MB)

// Global file drop handler — routes drops to the visible terminal
let fileDropInitialized = false;
function initFileDrop() {
  if (fileDropInitialized) return;
  fileDropInitialized = true;
  OnFileDrop((_x, _y, paths) => {
    const candidates = document.querySelectorAll<HTMLElement>("[data-terminal-id]");
    let id: string | undefined;
    for (const el of candidates) {
      if (el.offsetParent !== null) { id = el.dataset.terminalId; break; }
    }
    if (!id) return;
    const quoted = paths.map((p) => /[^a-zA-Z0-9_./:~-]/.test(p) ? "'" + p.replace(/'/g, "'\\''") + "'" : p);
    sendTerminalInput(id, quoted.join(" ")).catch(() => {});
  }, false);
}

export function InteractivePane({ terminalId, visible = true, fontSize = 12, onScrollStateChange, themeOverride, onExit, ref }: InteractivePaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const scrollCallbackRef = useRef(onScrollStateChange);
  const themeOverrideRef = useRef(themeOverride);
  const onExitRef = useRef(onExit);
  const visibleRef = useRef(visible);
  const flushRef = useRef<(() => void) | null>(null);
  scrollCallbackRef.current = onScrollStateChange;
  themeOverrideRef.current = themeOverride;
  onExitRef.current = onExit;
  visibleRef.current = visible;

  useImperativeHandle(ref, () => ({
    clear() {
      const term = termRef.current;
      if (term) term.clear();
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
        scrollCallbackRef.current?.(true);
      }
    },
    focus() {
      termRef.current?.focus();
    },
  }));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    initFileDrop();

    const term = new Terminal({
      fontSize,
      fontFamily: "'SF Mono', Menlo, Monaco, 'Courier New', monospace",
      cursorBlink: true,
      disableStdin: false,
      scrollback: 10000,
      theme: themeOverride ?? getTerminalTheme(el),
      allowProposedApi: true,
      vtExtensions: { kittyKeyboard: true },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);

    try { const s = new SearchAddon(); term.loadAddon(s); searchRef.current = s; } catch {}
    try { term.loadAddon(new WebLinksAddon((_e, uri) => BrowserOpenURL(uri))); } catch {}
    try { const u = new Unicode11Addon(); term.loadAddon(u); term.unicode.activeVersion = "11"; } catch {}

    term.open(el);
    termRef.current = term;
    fitRef.current = fit;

    // Load WebGL addon for GPU-accelerated rendering
    import("@xterm/addon-webgl").then(({ WebglAddon }) => {
      if (!termRef.current) return;
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        term.loadAddon(webgl);
      } catch {}
    }).catch(() => {});

    try { fit.fit(); } catch {}

    // Flow control: batch acks to reduce IPC calls
    let unsentAck = 0;
    const ackData = (charCount: number) => {
      unsentAck += charCount;
      while (unsentAck >= ACK_SIZE) {
        unsentAck -= ACK_SIZE;
        AckTerminalData(terminalId, ACK_SIZE).catch(() => {});
      }
    };

    // Visibility-gated write: when hidden, buffer data; flush on visible.
    // Capped to prevent unbounded memory growth from long-running background output.
    // Don't ack while hidden — let backend flow control pause naturally.
    // Ack on flush so xterm.js renders before backend resumes sending.
    let hiddenBuf: string[] = [];
    let hiddenBufLen = 0;
    const writeData = (data: string) => {
      if (!visibleRef.current) {
        if (hiddenBufLen < HIDDEN_BUF_CAP) {
          hiddenBuf.push(data);
          hiddenBufLen += data.length;
        }
        return;
      }
      term.write(data, () => ackData(data.length));
    };
    const flushHiddenBuf = () => {
      if (hiddenBuf.length === 0) return;
      const joined = hiddenBuf.join("");
      hiddenBuf = [];
      hiddenBufLen = 0;
      term.write(joined, () => ackData(joined.length));
    };
    flushRef.current = flushHiddenBuf;

    // Sync initial size to PTY
    ResizeTerminal(terminalId, term.cols, term.rows).catch(() => {});

    let sessionDead = false;
    const markDead = (msg: string, ansiColor: string) => {
      if (sessionDead) return;
      sessionDead = true;
      term.options.disableStdin = true;
      term.options.cursorBlink = false;
      term.write(`\r\n\x1b[${ansiColor}m${msg}\x1b[0m\r\n`);
    };

    const handleWriteError = () => markDead("[Session disconnected]", "91");

    term.onData((data) => {
      sendTerminalInput(terminalId, data).catch(handleWriteError);
    });

    // Send binary data (mouse events, etc.) to PTY
    term.onBinary((data) => {
      sendTerminalInput(terminalId, data).catch(handleWriteError);
    });

    // Sync resize to PTY
    term.onResize(({ cols, rows }) => {
      ResizeTerminal(terminalId, cols, rows).catch(() => {});
    });

    // Scroll tracking
    term.onScroll(() => {
      const buf = term.buffer.active;
      const atBottom = buf.baseY + term.rows >= buf.length;
      scrollCallbackRef.current?.(atBottom);
    });

    // Copy on select
    const handleMouseUp = () => {
      const selection = term.getSelection();
      if (selection) navigator.clipboard.writeText(selection).catch(() => {});
    };
    el.addEventListener("mouseup", handleMouseUp);

    // Theme sync
    const globalObserver = new MutationObserver(() => {
      if (!themeOverrideRef.current) term.options.theme = getTerminalTheme(el);
    });
    globalObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    // Receive PTY output as plain strings, write with callback for flow control
    const cleanupOutput = EventsOn("pty-output-" + terminalId, (data: string) => {
      writeData(data);
    });

    // Handle PTY exit
    const cleanupExit = EventsOn("pty-exit-" + terminalId, (exitCode: number) => {
      markDead(`[Process exited with code ${exitCode}]`, "90");
      onExitRef.current?.(exitCode);
    });

    // Resize observer — debounced at 200ms to avoid garbled redraws during
    // the sidebar's CSS transition (transition-[width] duration-200)
    let resizeTimer = 0;
    const ro = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeTimer = 0;
        if (!el.clientWidth || !el.clientHeight) return;
        try { fit.fit(); } catch {}
      }, 200);
    });
    ro.observe(el);

    term.focus();

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      el.removeEventListener("mouseup", handleMouseUp);
      globalObserver.disconnect();
      ro.disconnect();
      if (typeof cleanupOutput === "function") cleanupOutput();
      if (typeof cleanupExit === "function") cleanupExit();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
    };
  }, [terminalId]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = themeOverride ?? getTerminalTheme(containerRef.current);
  }, [themeOverride]);

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
      flushRef.current?.();
      try { fit.fit(); } catch {}
      try { term.refresh(0, term.rows - 1); } catch {}
      term.focus();
    });
  }, [visible]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-terminal-id={terminalId}
    >
      <div className="relative min-h-0 min-w-0 flex-1">
        <div ref={containerRef} className="absolute inset-0 overflow-hidden" />
      </div>
    </div>
  );
}
