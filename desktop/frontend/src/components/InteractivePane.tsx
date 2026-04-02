import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { EventsOn, BrowserOpenURL } from "../../wailsjs/runtime/runtime";
import { WriteTerminal, ResizeTerminal } from "../../wailsjs/go/main/App";
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
}

export const InteractivePane = forwardRef<InteractivePaneHandle, InteractivePaneProps>(
  function InteractivePane({ terminalId, visible = true, fontSize = 12, onScrollStateChange, themeOverride, onExit }, ref) {
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

      const term = new Terminal({
        fontSize,
        fontFamily: "'SF Mono', Menlo, Monaco, 'Courier New', monospace",
        cursorBlink: true,
        disableStdin: false,
        scrollback: 10000,
        theme: themeOverride ?? getTerminalTheme(el),
        allowProposedApi: true,
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

      // Streaming UTF-8 decoder handles multi-byte sequences split across PTY reads
      const utf8Decoder = new TextDecoder("utf-8", { fatal: false });

      // Batch writes: accumulate between frames, flush once per rAF.
      // When hidden, data accumulates without rendering — flushed on visibility change.
      let writeBuf = "";
      let writeRaf = 0;
      const flushWriteBuf = () => {
        if (writeBuf) {
          term.write(writeBuf);
          writeBuf = "";
        }
      };
      const scheduleWrite = (text: string) => {
        writeBuf += text;
        if (!visibleRef.current) return;
        if (!writeRaf) {
          writeRaf = requestAnimationFrame(() => {
            writeRaf = 0;
            flushWriteBuf();
          });
        }
      };
      flushRef.current = flushWriteBuf;

      // Sync initial size to PTY
      ResizeTerminal(terminalId, term.cols, term.rows).catch(() => {});

      // Encode bytes to base64 without stack-overflow risk from spread operator
      const toBase64 = (bytes: Uint8Array) => {
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
      };

      // Send keystrokes to PTY (TextEncoder handles non-Latin-1 chars like emoji)
      term.onData((data) => {
        WriteTerminal(terminalId, toBase64(new TextEncoder().encode(data))).catch(() => {});
      });

      // Send binary data (mouse events, etc.) to PTY
      term.onBinary((data) => {
        const bytes = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
        WriteTerminal(terminalId, toBase64(bytes)).catch(() => {});
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

      // Receive PTY output — decode base64 → bytes → UTF-8 string, batched per frame
      const cleanupOutput = EventsOn("pty-output-" + terminalId, (data: string) => {
        try {
          const raw = atob(data);
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
          const text = utf8Decoder.decode(bytes, { stream: true });
          if (text) scheduleWrite(text);
        } catch {}
      });

      // Handle PTY exit
      const cleanupExit = EventsOn("pty-exit-" + terminalId, (exitCode: number) => {
        term.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
        term.options.disableStdin = true;
        term.options.cursorBlink = false;
        onExitRef.current?.(exitCode);
      });

      // Resize observer (debounced — fit() is expensive during continuous resize)
      let resizeRaf = 0;
      const ro = new ResizeObserver(() => {
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
          resizeRaf = 0;
          try { fit.fit(); } catch {}
        });
      });
      ro.observe(el);

      term.focus();

      return () => {
        if (writeRaf) cancelAnimationFrame(writeRaf);
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        el.removeEventListener("mouseup", handleMouseUp);
        globalObserver.disconnect();
        ro.disconnect();
        if (typeof cleanupOutput === "function") cleanupOutput();
        if (typeof cleanupExit === "function") cleanupExit();
        term.dispose();
        termRef.current = null;
        fitRef.current = null;
        searchRef.current = null;
        // Note: StopTerminal is NOT called here — the parent TerminalView
        // handles PTY cleanup via handleCloseTerminal and its unmount effect.
        // Calling it here would break React StrictMode (double-mount in dev).
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div ref={containerRef} className="flex-1 overflow-hidden" />
      </div>
    );
  }
);
