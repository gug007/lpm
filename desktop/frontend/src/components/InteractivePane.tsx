import { useRef, useEffect, useImperativeHandle, type Ref } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import {
  EventsOn,
  OnFileDrop,
  OnFileDropOff,
} from "../../wailsjs/runtime/runtime";
import {
  ResizeTerminal,
  AckTerminalData,
  ReadClipboardFiles,
  SaveClipboardImage,
} from "../../wailsjs/go/main/App";
import { sendTerminalInput, shellQuote } from "../terminal-io";
import { getTerminalTheme, openTerminalLink } from "./terminal-utils";
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

// Global file drop handler — routes drops to the pane under the cursor
let fileDropInitialized = false;
function initFileDrop() {
  if (fileDropInitialized) return;
  fileDropInitialized = true;
  OnFileDrop((x, y, paths) => {
    const id = terminalIdAtPoint(x, y);
    if (!id) return;
    pasteToTerminal(id, formatPastedPaths(paths));
  }, false);
}

function terminalIdAtPoint(x: number, y: number): string | undefined {
  const hit = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-terminal-id]");
  if (hit) return hit.dataset.terminalId;
  // Fallback: elementFromPoint can miss the pane if an overlay sits above it —
  // scan pane rects directly.
  for (const pane of document.querySelectorAll<HTMLElement>(
    "[data-terminal-id]",
  )) {
    const r = pane.getBoundingClientRect();
    if (
      r.width > 0 &&
      r.height > 0 &&
      x >= r.left &&
      x < r.right &&
      y >= r.top &&
      y < r.bottom
    ) {
      return pane.dataset.terminalId;
    }
  }
  return undefined;
}

// Cached xterm instances keyed by terminalId; survive component remount
// (e.g. a pane split) so scrollback and PTY subscriptions stay intact.
interface InteractiveSession {
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon | null;
  host: HTMLDivElement;

  visible: boolean;
  hiddenBuf: string[];
  hiddenBufLen: number;
  sessionDead: boolean;

  // Installed by the current React mount, cleared on unmount so callbacks
  // closing over stale component state don't fire.
  onScrollState?: (atBottom: boolean) => void;
  onExit?: (exitCode: number) => void;
  themeOverride: ITheme | null;

  flush: () => void;
  destroy: () => void;
}

const interactiveSessions = new Map<string, InteractiveSession>();
export { interactiveSessions };

function disposeSession(s: InteractiveSession) {
  s.destroy();
  s.term.dispose();
  s.host.remove();
}

export function isInteractivePaneSessionDead(terminalId: string): boolean {
  return interactiveSessions.get(terminalId)?.sessionDead ?? false;
}

// One MutationObserver and one getComputedStyle per theme flip. Per-host
// lookups would be both wasteful (every session resolves through the same
// :root cascade) and wrong for detached hosts during the split-remount gap.
let themeObserver: MutationObserver | null = null;
function ensureThemeObserver() {
  if (themeObserver) return;
  themeObserver = new MutationObserver(() => {
    const theme = getTerminalTheme();
    for (const s of interactiveSessions.values()) {
      if (!s.themeOverride) s.term.options.theme = theme;
    }
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}

export function disposeInteractivePaneSession(terminalId: string) {
  const s = interactiveSessions.get(terminalId);
  if (!s) return;
  disposeSession(s);
  interactiveSessions.delete(terminalId);
}

// Wails caches the first OnFileDrop registration per page lifetime, so under
// Vite HMR the stale callback would keep firing with old code. Also dispose
// all cached sessions and the theme observer so the fresh module starts clean.
const viteHot = (
  import.meta as ImportMeta & { hot?: { dispose: (cb: () => void) => void } }
).hot;
if (viteHot) {
  viteHot.dispose(() => {
    OnFileDropOff();
    fileDropInitialized = false;
    for (const s of interactiveSessions.values()) disposeSession(s);
    interactiveSessions.clear();
    themeObserver?.disconnect();
    themeObserver = null;
  });
}

// Must be called during the paste event — items are invalidated after.
function extractImageBlob(
  items: DataTransferItemList,
): { blob: File; mimeType: string } | null {
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const blob = item.getAsFile();
      if (blob) return { blob, mimeType: item.type };
    }
  }
  return null;
}

function saveImageBlob(terminalId: string, blob: File, mimeType: string) {
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result as string;
    const b64 = dataUrl.split(",")[1];
    if (!b64) return;
    SaveClipboardImage(b64, mimeType)
      .then((filePath) => {
        pasteToTerminal(terminalId, filePath);
      })
      .catch((err) => console.warn("SaveClipboardImage failed:", err));
  };
  reader.readAsDataURL(blob);
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif)$/i;

// xterm's paste() emits CSI ?2004h bracketed-paste markers when the running
// app enabled them — writing to the PTY directly would skip those, leaving
// the receiver unable to distinguish a paste from typed input.
function pasteToTerminal(terminalId: string, text: string): void {
  interactiveSessions.get(terminalId)?.term.paste(text);
}

// Single image paths go in unquoted so a path-detecting receiver can stat
// them; everything else is shell-quoted for shell users.
function formatPastedPaths(paths: string[]): string {
  if (paths.length === 1 && IMAGE_EXT_RE.test(paths[0])) {
    return paths[0];
  }
  return paths.map(shellQuote).join(" ");
}

function createInteractiveSession(terminalId: string): InteractiveSession {
  const host = document.createElement("div");
  host.className = "absolute inset-0 overflow-hidden";
  host.setAttribute("data-terminal-id", terminalId);

  // fontSize and theme are placeholders — the React mount sets the real
  // values from props before the session is ever attached.
  const term = new Terminal({
    fontSize: 12,
    fontFamily: "'SF Mono', Menlo, Monaco, 'Courier New', monospace",
    cursorBlink: true,
    disableStdin: false,
    scrollback: 10000,
    theme: getTerminalTheme(),
    allowProposedApi: true,
    vtExtensions: { kittyKeyboard: true },
    linkHandler: { activate: openTerminalLink },
  });

  const fit = new FitAddon();
  term.loadAddon(fit);

  let search: SearchAddon | null = null;
  try {
    search = new SearchAddon();
    term.loadAddon(search);
  } catch {}
  try {
    term.loadAddon(new WebLinksAddon(openTerminalLink));
  } catch {}
  try {
    const u = new Unicode11Addon();
    term.loadAddon(u);
    term.unicode.activeVersion = "11";
  } catch {}

  // Intercept Cmd+key combos before kitty keyboard protocol encodes them.
  // Without this, Cmd+V/C/etc. are sent as CSI u sequences instead of
  // triggering paste/copy/other OS-level shortcuts.
  term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
    if (!e.metaKey) return true;
    if (e.key === "v") {
      return false;
    }
    if (e.key === "c" && e.type === "keydown") {
      const selection = term.getSelection();
      if (selection) navigator.clipboard.writeText(selection).catch(() => {});
      return false;
    }
    // Let all other Cmd+key combos fall through to the browser
    return false;
  });

  term.open(host);

  import("@xterm/addon-webgl")
    .then(({ WebglAddon }) => {
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        term.loadAddon(webgl);
      } catch {}
    })
    .catch(() => {});

  const session: InteractiveSession = {
    term,
    fit,
    search,
    host,
    visible: true,
    hiddenBuf: [],
    hiddenBufLen: 0,
    sessionDead: false,
    themeOverride: null,
    flush: () => {},
    destroy: () => {},
  };

  ensureThemeObserver();

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
  // Overflow: ack-and-drop so backend unacked doesn't get a permanent floor
  // (otherwise the reader can stay paused forever after the next pause).
  const writeData = (data: string) => {
    if (!session.visible) {
      if (session.hiddenBufLen < HIDDEN_BUF_CAP) {
        session.hiddenBuf.push(data);
        session.hiddenBufLen += data.length;
      } else {
        ackData(data.length);
      }
      return;
    }
    term.write(data, () => ackData(data.length));
  };
  session.flush = () => {
    if (session.hiddenBuf.length === 0) return;
    const joined = session.hiddenBuf.join("");
    session.hiddenBuf = [];
    session.hiddenBufLen = 0;
    term.write(joined, () => ackData(joined.length));
  };

  const markDead = (msg: string, ansiColor: string) => {
    if (session.sessionDead) return;
    session.sessionDead = true;
    term.options.disableStdin = true;
    term.options.cursorBlink = false;
    term.write(`\r\n\x1b[${ansiColor}m${msg}\x1b[0m\r\n`);
  };

  const handleWriteError = () => markDead("[Session disconnected]", "91");

  term.onData((data) => {
    sendTerminalInput(terminalId, data).catch(handleWriteError);
  });

  term.onBinary((data) => {
    sendTerminalInput(terminalId, data).catch(handleWriteError);
  });

  term.onResize(({ cols, rows }) => {
    ResizeTerminal(terminalId, cols, rows).catch(() => {});
  });

  term.onScroll(() => {
    const buf = term.buffer.active;
    const atBottom = buf.baseY + term.rows >= buf.length;
    session.onScrollState?.(atBottom);
  });

  ResizeTerminal(terminalId, term.cols, term.rows).catch(() => {});

  // Attached to term.textarea — that's where xterm.js focuses and receives paste events.
  const handlePaste = (e: ClipboardEvent) => {
    if (!e.clipboardData) return;

    const hasFiles =
      e.clipboardData.types.includes("Files") ||
      e.clipboardData.files.length > 0;

    if (hasFiles) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const textFallback = e.clipboardData.getData("text/plain");
      // Capture synchronously — clipboardData.items is invalidated after
      // the handler returns. Used as a fallback because WebKit often omits
      // the image MIME on file-URL pastes.
      const imageData = extractImageBlob(e.clipboardData.items);
      const fallback = () => {
        if (imageData) saveImageBlob(terminalId, imageData.blob, imageData.mimeType);
        else if (textFallback) pasteToTerminal(terminalId, textFallback);
      };
      ReadClipboardFiles()
        .then((paths) => {
          if (paths && paths.length > 0) {
            pasteToTerminal(terminalId, formatPastedPaths(paths));
          } else {
            fallback();
          }
        })
        .catch(fallback);
      return;
    }

    const imgData = extractImageBlob(e.clipboardData.items);
    if (imgData) {
      e.preventDefault();
      e.stopImmediatePropagation();
      saveImageBlob(terminalId, imgData.blob, imgData.mimeType);
      return;
    }
    // No files or images — let the event propagate so xterm.js handles text paste
  };
  const textarea = term.textarea;
  textarea?.addEventListener("paste", handlePaste, true);

  const cleanupOutput = EventsOn("pty-output-" + terminalId, (data: string) => {
    writeData(data);
  });

  const cleanupExit = EventsOn(
    "pty-exit-" + terminalId,
    (exitCode: number) => {
      markDead(`[Process exited with code ${exitCode}]`, "90");
      session.onExit?.(exitCode);
    },
  );

  session.destroy = () => {
    textarea?.removeEventListener("paste", handlePaste, true);
    if (typeof cleanupOutput === "function") cleanupOutput();
    if (typeof cleanupExit === "function") cleanupExit();
  };

  return session;
}

function getOrCreateInteractiveSession(terminalId: string): InteractiveSession {
  const existing = interactiveSessions.get(terminalId);
  if (existing) return existing;
  const session = createInteractiveSession(terminalId);
  interactiveSessions.set(terminalId, session);
  return session;
}

export function InteractivePane({
  terminalId,
  visible = true,
  fontSize = 12,
  onScrollStateChange,
  themeOverride,
  onExit,
  ref,
}: InteractivePaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<InteractiveSession | null>(null);
  const scrollCallbackRef = useRef(onScrollStateChange);
  const themeOverrideRef = useRef(themeOverride);
  const onExitRef = useRef(onExit);
  scrollCallbackRef.current = onScrollStateChange;
  themeOverrideRef.current = themeOverride;
  onExitRef.current = onExit;

  useImperativeHandle(ref, () => ({
    clear() {
      const session = sessionRef.current;
      if (session) session.term.clear();
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
      scrollCallbackRef.current?.(true);
    },
    focus() {
      sessionRef.current?.term.focus();
    },
  }));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    initFileDrop();

    const session = getOrCreateInteractiveSession(terminalId);
    sessionRef.current = session;

    session.term.options.fontSize = fontSize;
    session.term.options.theme =
      themeOverrideRef.current ?? getTerminalTheme(el);
    session.themeOverride = themeOverrideRef.current ?? null;
    session.onScrollState = (atBottom) => scrollCallbackRef.current?.(atBottom);
    session.onExit = (code) => onExitRef.current?.(code);

    el.appendChild(session.host);

    try {
      session.fit.fit();
    } catch {}

    // Resize observer — debounced at 200ms to avoid garbled redraws during
    // the sidebar's CSS transition (transition-[width] duration-200)
    let resizeTimer = 0;
    const ro = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeTimer = 0;
        if (!session.host.clientWidth || !session.host.clientHeight) return;
        try {
          session.fit.fit();
        } catch {}
      }, 200);
    });
    ro.observe(session.host);

    session.term.focus();

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      ro.disconnect();
      session.onScrollState = undefined;
      session.onExit = undefined;
      if (session.host.parentNode) {
        session.host.parentNode.removeChild(session.host);
      }
      sessionRef.current = null;
    };
  }, [terminalId]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.themeOverride = themeOverride ?? null;
    session.term.options.theme =
      themeOverride ?? getTerminalTheme(containerRef.current);
  }, [themeOverride]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.term.options.fontSize = fontSize;
    try {
      session.fit.fit();
    } catch {}
  }, [fontSize]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (!visible) {
      session.visible = false;
      return;
    }
    // Flush synchronously before flipping visible so any pty-output
    // events arriving after this point see an empty buffer and write
    // directly in order — no flush/write race.
    session.flush();
    session.visible = true;
    const term = session.term;
    const fit = session.fit;
    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {}
      try {
        term.refresh(0, term.rows - 1);
      } catch {}
      term.focus();
    });
  }, [visible]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={containerRef}
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
      />
    </div>
  );
}
