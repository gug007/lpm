import { useRef, useEffect, useImperativeHandle, useState, type Ref } from "react";
import { Terminal, type IDisposable, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { SerializeAddon } from "@xterm/addon-serialize";
import {
  EventsOn,
} from "../../bridge/runtime";
import {
  ResizeTerminal,
  AckTerminalData,
  ReadClipboardFiles,
  SaveClipboardImage,
  SetClipboardText,
  IsTerminalRemote,
  UploadAndQuoteForTerminal,
  UploadClipboardImageForTerminal,
} from "../../bridge/commands";
import { sendTerminalInput, shellQuote } from "../terminal-io";
import { getTerminalTheme, openTerminalLink, TERMINAL_FONT_FAMILY } from "./terminal-utils";
import { handleCopyShortcut, handleNativeCopy, handleSelectAllShortcut, handleClearShortcut, isCopyShortcut } from "./terminal/copySelection";
import { ConsoleContextMenu } from "./terminal/ConsoleContextMenu";
import { applyFilterQuery, FilterMirror } from "./terminal/FilterMirror";
import {
  PASTE_QUIET_MS,
  PASTE_CEILING_MS,
  QUIET_POLL_MS,
  PASTE_IMAGE_CEILING_MS,
  CR_VERIFY_GRACE_MS,
  CR_MAX_RETRIES,
  canGlueCr,
  canSkipQuietGate,
  crWasSwallowed,
} from "./terminal/submitGate";
import { stripAnsi } from "./terminal/filterLines";
import { registerPathLinkProvider } from "./terminal/pathLinkProvider";
import { registerFileDropHandler } from "../fileDrop";
import { logDiagnostic } from "../diagnostics";
import { isPeerName, PEER_IMAGE_MAX_BYTES } from "../peer/markers";
import {
  IS_MIRROR_WINDOW,
  REALM,
  broadcastMirrorSize,
  onMirrorSize,
  broadcastMirrorDesired,
  onMirrorDesired,
  onMirrorSnapshotRequest,
  replyMirrorSnapshot,
  requestMirrorSnapshot,
  onMirrorSnapshot,
  broadcastMirrorAcking,
  onMirrorAcking,
} from "../mirror";
import {
  amControlOwner,
  onControlChange,
  applyControlOwner,
  isOwnedByDetachedWindow,
  type ControlOwner,
} from "../store/terminalControl";
import {
  TerminalPresentControl,
  TerminalUnpresentControl,
  TerminalClaimControl,
} from "../../bridge/commands";
import "@xterm/xterm/css/xterm.css";

// Cross-window flow-control ack authority (one window acks a PTY's output; two
// desync the shared counter). Window-level state shared by every session.
//
// Mirror-side: this window is the acker while it's focused AND visible — then
// it's not OS-throttled, so its acks keep the producer flowing in real time.
// Owner-side: mirrorIsAckAuthority tracks whether a mirror currently owns acking
// so the owner can defer. Both default to "owner acks", so a window with no
// mirror behaves exactly as before.
let mirrorAmAckAuthority = false;
let mirrorIsAckAuthority = false;
if (IS_MIRROR_WINDOW) {
  const publishAcking = () => {
    const next = document.hasFocus() && !document.hidden;
    if (next === mirrorAmAckAuthority) return;
    mirrorAmAckAuthority = next;
    broadcastMirrorAcking(next);
  };
  window.addEventListener("focus", publishAcking);
  window.addEventListener("blur", publishAcking);
  document.addEventListener("visibilitychange", publishAcking);
  window.addEventListener("beforeunload", () => {
    if (mirrorAmAckAuthority) broadcastMirrorAcking(false);
  });
  publishAcking();
} else {
  onMirrorAcking((acking) => {
    mirrorIsAckAuthority = acking;
  });
  // Safety net: whenever this owner window is focused, it acks — no other window
  // can be the ack authority (macOS focuses one at a time). This also clears a
  // stale claim left by a mirror that closed without broadcasting a release.
  window.addEventListener("focus", () => {
    mirrorIsAckAuthority = false;
  });
}

export interface InteractivePaneHandle {
  clear: () => void;
  findNext: (query: string) => boolean;
  findPrevious: (query: string) => boolean;
  clearSearch: () => void;
  setFilter: (query: string | null, onCount?: (count: number) => void) => void;
  scrollToBottom: () => void;
  focus: () => void;
  // Returns false when the target session is gone or its process has exited,
  // so callers can warn instead of dropping the text into a dead PTY. Pass an
  // array to deliver the parts as separate, sequential pastes (used so image
  // paths land at the cursor in order rather than being front-loaded).
  submitInput: (input: string | string[]) => boolean;
}

interface InteractivePaneProps {
  terminalId: string;
  visible?: boolean;
  fontSize?: number;
  onScrollStateChange?: (atBottom: boolean) => void;
  themeOverride?: ITheme | null;
  onExit?: (exitCode: number) => void;
  cwd?: string;
  ref?: Ref<InteractivePaneHandle>;
}

// Flow control: ack in batches to reduce IPC calls (matches VS Code's approach)
const ACK_SIZE = 5000;

// A copy this soon after a selection gesture reported to a mouse-owning app
// asks the app to copy its own selection (Ctrl+C — Claude Code's only copy
// trigger). The on-screen copy hint is what verifies the selection is still
// alive at fire time; the window just bounds how long a stale gesture can
// authorize one, since a bare Ctrl+C doubles as an interrupt.
const APP_SELECTION_WINDOW_MS = 60000;
// An app may write the clipboard only on the heels of the user's own input to
// its terminal (a copy is always an answer to a keystroke or click there).
// Anything later — or from a session the user isn't touching — is dropped.
const APP_CLIPBOARD_INPUT_WINDOW_MS = 15000;
// While its selection is active, Claude Code advertises how to lift it in its
// status row, and the form depends on its copyOnSelect setting: with it off,
// " · ctrl+c to copy" (Ctrl+C copies the selection); with it on, it has
// already copied the selection at mouseup and the row instead reads
// "shift+click to native select" (or "option+click …" on some configs).
// Either advertisement proves the app's selection is still alive, and Ctrl+C
// is safe to send while it is: Claude consumes it — copying when copyOnSelect
// is off, clearing the already-copied selection when on — so it never lands
// as an interrupt. Requiring one of these rows (and only in the last drawn
// rows where the status line lives) means transcript prose merely mentioning
// a chord can't authorize a Ctrl+C. The status row is the last non-blank row:
// Claude draws inline (blank screen below its chrome) in short sessions and
// bottom-anchored in full ones, so fixed bottom offsets miss it.
const APP_COPY_HINT_RE = /·\s*ctrl\+c to copy|(?:shift|option)\+click to native select/i;
const APP_COPY_HINT_ROWS = 3;

// Serialized so two copies arriving close together can't land out of order
// and leave the clipboard holding the older payload.
let clipboardWriteChain: Promise<void> = Promise.resolve();
function writeAppClipboard(text: string): void {
  clipboardWriteChain = clipboardWriteChain
    .then(() => SetClipboardText(text))
    .catch(() => {});
}

function getTerminalRemote(id: string): Promise<boolean> {
  return interactiveSessions.get(id)?.remote ?? Promise.resolve(false);
}

// Global file drop handler — routes drops to the pane under the cursor
let fileDropInitialized = false;
function initFileDrop() {
  if (fileDropInitialized) return;
  fileDropInitialized = true;
  registerFileDropHandler("terminals", (x, y, paths) => {
    const id = terminalIdAtPoint(x, y);
    if (!id) return false;
    // Remote (peer) terminals live on another Mac; local file paths can't be
    // uploaded there in v1. Consume the drop without acting.
    if (isPeerName(id)) return true;
    getTerminalRemote(id).then((remote) => {
      if (remote) {
        UploadAndQuoteForTerminal(id, paths)
          .then((text) => pasteToTerminal(id, text))
          .catch((err) => writeTerminalError(id, err));
      } else {
        pasteToTerminal(id, formatPastedPaths(paths));
      }
    });
    return true;
  });
}

function terminalIdAtPoint(x: number, y: number): string | undefined {
  const top = document.elementFromPoint(x, y);
  const hit = top?.closest<HTMLElement>("[data-terminal-id]");
  if (hit) return hit.dataset.terminalId;
  // A modal sits above the panes; don't route a drop on it to a hidden pane.
  if (top?.closest("[data-modal-overlay]")) return undefined;
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
  serialize: SerializeAddon | null;
  host: HTMLDivElement;

  sessionDead: boolean;
  remote: Promise<boolean>;

  lastOutputAt: number;
  delivering: boolean;

  cwd: string;
  pathLinkDisposable: IDisposable | null;
  osc52Disposable: IDisposable | null;

  // Copy routed to the mouse-owning app (Claude Code's Ctrl+C-with-selection);
  // exposed so the context menu shares the ⌘C path's gates.
  canAppCopy: () => boolean;
  tryAppCopy: () => boolean;

  // Whether this window is currently showing this terminal as its active,
  // visible tab (set by the React mount from the `visible` prop). Note this is
  // TRUE even when the pane sits display:none behind the "take control"
  // placeholder — so a focus-claim can fire for a placeholder view, which
  // `offsetParent`/`isLaidOut` (both false there) could not detect.
  presenting: boolean;

  // Installed by the current React mount, cleared on unmount so callbacks
  // closing over stale component state don't fire.
  onScrollState?: (atBottom: boolean) => void;
  onExit?: (exitCode: number) => void;
  // Run after the buffer is cleared so a live filter overlay refreshes too.
  onAfterClear?: () => void;
  themeOverride: ITheme | null;

  // Marks the session disconnected (same path onData uses on a failed write).
  handleWriteError?: () => void;
  // Force this owner to (re)drive the PTY to its current xterm size. Needed when
  // this window becomes the control owner: a no-op fit() emits no onResize, so
  // the size would otherwise never reach the PTY.
  reassertSize?: () => void;
  destroy: () => void;
}

const interactiveSessions = new Map<string, InteractiveSession>();
export { interactiveSessions };

function disposeSession(s: InteractiveSession) {
  s.destroy();
  s.pathLinkDisposable?.dispose();
  s.osc52Disposable?.dispose();
  s.term.dispose();
  s.host.remove();
}

export function isInteractivePaneSessionDead(terminalId: string): boolean {
  return interactiveSessions.get(terminalId)?.sessionDead ?? false;
}

// Plain-text snapshot of a terminal's recent scrollback + screen, for the
// composer's "@<terminal>" mention. xterm's SerializeAddon replays the buffer
// with ANSI intact, so strip it; bounded to the last `maxLines` scrollback rows
// so a long-lived session can't dump its whole history into a prompt. Returns ""
// when there's no live session (or the addon failed to load).
export function captureInteractivePaneLog(terminalId: string, maxLines: number): string {
  const serialize = interactiveSessions.get(terminalId)?.serialize;
  if (!serialize) return "";
  try {
    return stripAnsi(serialize.serialize({ scrollback: maxLines }));
  } catch {
    return "";
  }
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

// Vite HMR: dispose cached xterm sessions and the theme observer. The shared
// fileDrop registry handles its own deregistration.
const viteHot = (
  import.meta as ImportMeta & { hot?: { dispose: (cb: () => void) => void } }
).hot;
if (viteHot) {
  viteHot.dispose(() => {
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
  const peer = isPeerName(terminalId);
  // A remote (peer) terminal caps the image so its base64 stays under the peer
  // link's frame limit; the upload command runs on the host and returns a path
  // the host pane can read.
  if (peer && blob.size > PEER_IMAGE_MAX_BYTES) {
    writeTerminalError(terminalId, "image too large to send to a remote Mac (max 8 MB)");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result as string;
    const b64 = dataUrl.split(",")[1];
    if (!b64) return;
    getTerminalRemote(terminalId).then((remote) => {
      if (remote || peer) {
        UploadClipboardImageForTerminal(terminalId, b64, mimeType)
          .then((text) => pasteToTerminal(terminalId, text))
          .catch((err) => writeTerminalError(terminalId, err));
      } else {
        SaveClipboardImage(b64, mimeType)
          .then((filePath) => pasteToTerminal(terminalId, filePath))
          .catch((err) =>
            logDiagnostic(
              "warn",
              "clipboard.image_save_failed",
              "Clipboard image could not be saved",
              err,
            ),
          );
      }
    });
  };
  reader.readAsDataURL(blob);
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif)$/i;

// Permissive match so a label change ("[Image #1]" → "[Image:" …) still counts.
function countImageMarkers(text: string): number {
  return (text.match(/\[image/gi) ?? []).length;
}

// Single image paths go in unquoted so a path-detecting receiver can stat
// them; everything else is shell-quoted for shell users.
function formatPastedPaths(paths: string[]): string {
  if (paths.length === 1 && IMAGE_EXT_RE.test(paths[0])) {
    return paths[0];
  }
  return paths.map(shellQuote).join(" ");
}

// xterm's paste() emits CSI ?2004h bracketed-paste markers when the running
// app enabled them — writing to the PTY directly would skip those, leaving
// the receiver unable to distinguish a paste from typed input.
function pasteToTerminal(terminalId: string, text: string): void {
  interactiveSessions.get(terminalId)?.term.paste(text);
}

function writeTerminalError(terminalId: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const term = interactiveSessions.get(terminalId)?.term;
  if (!term) return;
  term.write(`\r\n\x1b[31mlpm upload failed: ${msg}\x1b[0m\r\n`);
}

function viewportShowsAppCopyHint(term: Terminal): boolean {
  const buf = term.buffer.active;
  const end = Math.min(buf.viewportY + term.rows, buf.length);
  let checked = 0;
  for (let y = end - 1; y >= buf.viewportY && checked < APP_COPY_HINT_ROWS; y--) {
    const line = buf.getLine(y);
    if (!line) continue;
    const text = line.translateToString(true);
    if (!/\S/.test(text)) continue;
    checked++;
    if (APP_COPY_HINT_RE.test(text)) return true;
  }
  return false;
}

function createInteractiveSession(terminalId: string, cwd: string): InteractiveSession {
  const host = document.createElement("div");
  host.className = "absolute inset-0 overflow-hidden";
  host.setAttribute("data-terminal-id", terminalId);
  host.setAttribute("data-file-drop-target", "");

  // fontSize and theme are placeholders — the React mount sets the real
  // values from props before the session is ever attached.
  const term = new Terminal({
    fontSize: 12,
    fontFamily: TERMINAL_FONT_FAMILY,
    cursorBlink: true,
    disableStdin: false,
    scrollback: 10000,
    theme: getTerminalTheme(),
    allowProposedApi: true,
    vtExtensions: { kittyKeyboard: true },
    // Mouse-owning apps suppress local selection; ⌥ drag opts back into it.
    macOptionClickForcesSelection: true,
    // On mac xterm word-selects under a right-click by default. That phantom
    // selection would shadow the running app's own selection in the context
    // menu, making Copy grab the word under the cursor instead of asking the
    // app for what the user highlighted.
    rightClickSelectsWord: false,
    linkHandler: { activate: openTerminalLink },
  });

  const fit = new FitAddon();
  term.loadAddon(fit);

  let search: SearchAddon | null = null;
  try {
    search = new SearchAddon();
    term.loadAddon(search);
  } catch {}
  let serialize: SerializeAddon | null = null;
  try {
    serialize = new SerializeAddon();
    term.loadAddon(serialize);
  } catch {}
  try {
    term.loadAddon(new WebLinksAddon(openTerminalLink));
  } catch {}
  try {
    const u = new Unicode11Addon();
    term.loadAddon(u);
    term.unicode.activeVersion = "11";
  } catch {}

  // When an app owns the mouse it also owns the selection: Claude Code
  // highlights dragged text itself and lifts it to the clipboard on Ctrl+C
  // while that selection is active (with copyOnSelect it copies at mouseup
  // instead and the Ctrl+C just clears the highlight — still consumed, never
  // an interrupt). Its kitty cmd+c binding is NOT active at the REPL (probed
  // 2.1.208), so translating ⌘C into Ctrl+C stays the only copy trigger lpm
  // can drive. Watch the outgoing SGR mouse reports for a left-button drag —
  // the gesture that gives the app a selection worth copying — so ⌘C right
  // after can be translated into the app's own copy. A motionless click
  // clears the app's selection, so it clears the marker too.
  let lastAppDragAt = 0;
  let lastUserInputAt = 0;
  let dragHasMotion = false;
  let multiClickPending = false;
  let copyChordForwarded = false;

  term.onData((data) => {
    lastUserInputAt = Date.now();
    // Any typed/pasted input clears Claude Code's selection (any printable
    // key does, without being consumed), so it disarms the marker too —
    // mouse reports and focus in/out are the only traffic that doesn't.
    if (data.replace(/\x1b\[(?:<\d+;\d+;\d+[Mm]|[IO])/g, "")) {
      lastAppDragAt = 0;
      dragHasMotion = false;
      return;
    }
    if (term.modes.mouseTrackingMode === "none") return;
    for (const m of data.matchAll(/\x1b\[<(\d+);\d+;\d+([Mm])/g)) {
      const btn = Number(m[1]);
      if (btn >= 64) continue; // wheel
      if ((btn & 3) !== 0) continue; // left button only
      if (btn & 32) {
        dragHasMotion = true;
      } else if (m[2] === "m") {
        // Drags and double/triple clicks give the app a selection; a plain
        // motionless click clears one.
        lastAppDragAt = dragHasMotion || multiClickPending ? Date.now() : 0;
        dragHasMotion = false;
        multiClickPending = false;
      } else {
        dragHasMotion = false;
      }
    }
  });

  // A copy chord with no local selection belongs to the mouse-owning app:
  // right after a drag the app is holding a selection, and Claude Code copies
  // it on Ctrl+C — its only external copy trigger. One-shot so a repeat ⌘C
  // can't turn into a bare interrupt once the selection is gone.
  const canAppCopy = (): boolean =>
    lastAppDragAt !== 0 &&
    Date.now() - lastAppDragAt < APP_SELECTION_WINDOW_MS &&
    term.modes.mouseTrackingMode !== "none" &&
    viewportShowsAppCopyHint(term);

  const tryAppCopy = (): boolean => {
    if (!canAppCopy()) return false;
    lastAppDragAt = 0;
    lastUserInputAt = Date.now();
    sendTerminalInput(terminalId, "\x03").catch(() => {});
    return true;
  };

  // Intercept Cmd+key combos before kitty keyboard protocol encodes them.
  // Without this, Cmd+V/C/etc. are sent as CSI u sequences instead of
  // triggering paste/copy/other OS-level shortcuts.
  term.attachCustomKeyEventHandler((e) => {
    if (handleCopyShortcut(e, term, serialize)) return false;
    if (handleSelectAllShortcut(e, term)) return false;
    if (
      handleClearShortcut(e, term, {
        onClear: () => {
          term.clear();
          interactiveSessions.get(terminalId)?.onAfterClear?.();
        },
      })
    )
      return false;
    // ⌘C with no local selection belongs to the mouse-owning app. (On macOS
    // the native Edit→Copy accelerator usually claims the chord before any
    // keydown reaches the page — the copy listener below handles that path —
    // but a keydown that does arrive gets the same treatment.)
    if (isCopyShortcut(e) && !term.hasSelection()) {
      // Keep keyup pairing consistent with what its keydown did, so kitty
      // apps that track key releases never see an orphan press or release.
      if (e.type !== "keydown") return copyChordForwarded;
      if (tryAppCopy()) {
        copyChordForwarded = false;
        e.preventDefault();
        return false;
      }
      copyChordForwarded = true;
      return true;
    }
    if (!e.metaKey) return true;
    return false;
  });

  // The native Edit→Copy accelerator delivers ⌘C as a copy event on the
  // focused element (no DOM keydown fires), so this listener is the primary
  // entry point for the chord: local selection wins, otherwise the app gets
  // to copy its own.
  host.addEventListener(
    "copy",
    (e) => {
      if (handleNativeCopy(e, term, serialize)) return;
      if (tryAppCopy()) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );

  // xterm preventDefaults mousedown (killing the browser's focus change) and
  // only focuses itself when the app owns the mouse — a plain selection drag
  // leaves focus in the composer, and the ⌘C that follows would never reach
  // this terminal. Clicking a terminal means keys belong to it. The click
  // count rides along: SGR reports can't distinguish a double-click word
  // selection from a selection-clearing single click.
  host.addEventListener("mousedown", (e) => {
    term.focus();
    if (e.button === 0) multiClickPending = e.detail >= 2;
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
    serialize,
    host,
    remote: IsTerminalRemote(terminalId).catch(() => false),
    sessionDead: false,
    presenting: false,
    lastOutputAt: 0,
    delivering: false,
    themeOverride: null,
    cwd,
    pathLinkDisposable: null,
    osc52Disposable: null,
    canAppCopy,
    tryAppCopy,
    destroy: () => {},
  };

  try {
    session.pathLinkDisposable = registerPathLinkProvider(term, {
      getCwd: () => session.cwd,
    });
  } catch {}

  // OSC 52: programs that own their selection (Claude Code under mouse
  // reporting) copy by emitting the selected text; land it in the system
  // clipboard. Write-only — "?" queries are never answered, since responding
  // would hand the clipboard contents to the running program.
  try {
    session.osc52Disposable = term.parser.registerOscHandler(52, (data) => {
      const sep = data.indexOf(";");
      if (sep === -1) return true;
      const target = data.slice(0, sep);
      const payload = data.slice(sep + 1);
      if (target && !target.includes("c")) return true;
      if (!payload || payload === "?") return true;
      if (Date.now() - lastUserInputAt > APP_CLIPBOARD_INPUT_WINDOW_MS) return true;
      // A hidden pane can't be answering the user — drop background writes.
      if (!session.host.isConnected || session.host.offsetParent === null) return true;
      try {
        const bytes = Uint8Array.from(atob(payload), (ch) => ch.charCodeAt(0));
        const text = new TextDecoder().decode(bytes);
        if (text) writeAppClipboard(text);
      } catch {
        // Malformed base64 — ignore.
      }
      return true;
    });
  } catch {}

  ensureThemeObserver();

  let unsentAck = 0;
  // Exactly one window acks a PTY's output — two acking the same bytes would
  // desync the single shared flow-control counter. The owner acks by default;
  // when a focused, visible mirror declares itself the ack authority (because
  // the owner is hidden and its ack loop is throttled), it takes over acking the
  // terminals it renders live. Ack authority is scoped per terminal by control
  // ownership: a mirror acks only the terminals it OWNS, and the owner defers
  // only for the terminals a focused mirror owns — so terminals the mirror shows
  // behind a "take control" placeholder, other projects, and background tabs keep
  // being acked by the owner instead of starving while a mirror is focused. With
  // no mirror both flags stay false → owner acks everything, as before.
  const ackData = (charCount: number) => {
    if (IS_MIRROR_WINDOW) {
      if (!mirrorAmAckAuthority || !amControlOwner(terminalId)) return;
    } else if (mirrorIsAckAuthority && isOwnedByDetachedWindow(terminalId)) {
      return;
    }
    unsentAck += charCount;
    while (unsentAck >= ACK_SIZE) {
      unsentAck -= ACK_SIZE;
      AckTerminalData(terminalId, ACK_SIZE).catch(() => {});
    }
  };

  // Mirror seeding state: a joining mirror renders nothing until it has a
  // scrollback snapshot from the owner (or a short fallback fires), so live
  // output doesn't paint a torn screen ahead of the snapshot. `preSeed` holds
  // live chunks until then.
  let seeded = !IS_MIRROR_WINDOW;
  const preSeed: string[] = [];
  // A mirror that goes fully hidden (window occluded/minimized) has its xterm
  // parser throttled by the OS while output keeps arriving — its write backlog
  // would grow unbounded (the owner's ack governs the PRODUCER, not the mirror).
  // So a hidden mirror drops output and re-seeds from a fresh snapshot on show.
  let droppedWhileHidden = false;

  // Always write + ack in the owner, even when the pane is hidden. xterm.js
  // keeps its own bounded scrollback, so background terminals stay drained and
  // long-running processes (AI agents, scripts) never block on a full PTY
  // buffer. A mirror never acks (owner-only) and applies the seeding/memory
  // gates above before rendering.
  const writeData = (data: string) => {
    if (IS_MIRROR_WINDOW) {
      // Ack on receipt while we're the acker (a focused, visible mirror isn't
      // throttled, so receipt ≈ render). No-op otherwise.
      ackData(data.length);
      if (document.hidden) {
        droppedWhileHidden = true;
        return;
      }
      if (!seeded) {
        preSeed.push(data);
        return;
      }
      term.write(data);
      return;
    }
    // Owner. When a mirror holds ack authority and this window is hidden, the
    // producer is no longer paused on our behalf, so writing would grow xterm's
    // parse queue unbounded (our parser is OS-throttled while hidden). Drop and
    // reseed on show — exactly the mirror's memory bound — since the mirror is
    // the live renderer meanwhile. Never triggers without a mirror (main-only).
    if (mirrorIsAckAuthority && document.hidden) {
      droppedWhileHidden = true;
      return;
    }
    term.write(data, () => ackData(data.length));
  };

  const markDead = (msg: string, ansiColor: string) => {
    if (session.sessionDead) return;
    session.sessionDead = true;
    term.options.disableStdin = true;
    term.options.cursorBlink = false;
    term.write(`\r\n\x1b[${ansiColor}m${msg}\x1b[0m\r\n`);
  };

  const handleWriteError = () => markDead("[Session disconnected]", "91");
  session.handleWriteError = handleWriteError;

  term.onData((data) => {
    sendTerminalInput(terminalId, data).catch(handleWriteError);
  });

  term.onBinary((data) => {
    sendTerminalInput(terminalId, data).catch(handleWriteError);
  });

  // The owner's host isn't in the DOM yet at session-create and may be mounted
  // hidden (a detached project kept alive in the main window but not selected).
  // A hidden host fits to a bogus 80x24 that would then drive the shared PTY, so
  // the owner only drives geometry while it's actually laid out.
  const isLaidOut = () =>
    session.host.isConnected &&
    session.host.offsetParent !== null &&
    session.host.clientWidth > 0;

  // This window drives the shared PTY size only while it OWNS this terminal
  // (control ownership, tracked in Rust) and is actually laid out. Exactly one
  // surface owns a terminal at a time, so the two windows (and any phone) can't
  // fight over one PTY's geometry, and a non-owner never resizes it out from
  // under the owner. Replaces the previous focus-follows heuristic.
  const amOwner = () => amControlOwner(terminalId) && isLaidOut();

  // One PTY has one geometry: the owner is the sole caller of ResizeTerminal and
  // publishes the result so the mirror renders at the same cols/rows instead of
  // mis-wrapping the shared stream. Always paired, so callers can't desync them.
  const driveOwnerSize = (cols: number, rows: number) => {
    ResizeTerminal(terminalId, cols, rows).catch(() => {});
    broadcastMirrorSize(terminalId, { cols, rows });
  };

  // The PTY owner (main) re-asserts the current size when it (re)gains control —
  // fit() alone won't, since an already-fitted xterm emits no onResize. A mirror
  // owner instead republishes its desired size through reconcileGeometry.
  session.reassertSize = () => {
    if (!IS_MIRROR_WINDOW && amOwner()) {
      driveOwnerSize(term.cols, term.rows);
    }
  };

  // Drive the PTY (and mirror) from a local fit only when this window holds size
  // authority. Without the focus gate an unfocused owner's ResizeObserver — e.g.
  // triggered by the mirror re-laying-out the owner's panes after a forwarded
  // divider drag — would refit to the MAIN window's container and clobber the
  // focused mirror's geometry ~350ms later.
  term.onResize(({ cols, rows }) => {
    if (IS_MIRROR_WINDOW) return;
    if (!amOwner()) return;
    driveOwnerSize(cols, rows);
  });

  term.onScroll(() => {
    const buf = term.buffer.active;
    const atBottom = buf.baseY + term.rows >= buf.length;
    session.onScrollState?.(atBottom);
  });

  if (!IS_MIRROR_WINDOW && amOwner()) {
    driveOwnerSize(term.cols, term.rows);
  }

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
          // Peer terminals can't receive local file paths; fall back to any
          // plain-text/image handling the local branch would do.
          if (isPeerName(terminalId)) {
            fallback();
            return;
          }
          if (paths && paths.length > 0) {
            return getTerminalRemote(terminalId).then((remote) => {
              if (remote) {
                return UploadAndQuoteForTerminal(terminalId, paths)
                  .then((text) => pasteToTerminal(terminalId, text))
                  .catch((err) => writeTerminalError(terminalId, err));
              }
              pasteToTerminal(terminalId, formatPastedPaths(paths));
            });
          }
          fallback();
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
    session.lastOutputAt = performance.now();
    writeData(data);
  });

  const cleanupExit = EventsOn(
    "pty-exit-" + terminalId,
    (exitCode: number) => {
      markDead(`[Process exited with code ${exitCode}]`, "90");
      session.onExit?.(exitCode);
    },
  );

  // Cross-window mirroring wiring.
  //
  // Focusing a window makes it OWN what it's actively showing: this one listener
  // both takes control of the laid-out terminal (so the active window is where it
  // renders live) and reconciles its geometry, for whichever role this window is.
  // Both no-op for panes that aren't laid out (hidden tabs / kept-mounted detached
  // projects), so a focus event only affects the terminals the user can see.
  const onWinFocus = () => {
    claimIfActive(session, terminalId);
    reconcileGeometry(session, terminalId);
  };
  window.addEventListener("focus", onWinFocus);

  let cleanupMirror: (() => void) | null = null;
  if (IS_MIRROR_WINDOW) {
    // Render the owner's authoritative geometry (the mirror never fits its own
    // container — that would mis-wrap the shared stream).
    const applySize = (cols: number, rows: number) => {
      if (!cols || !rows) return;
      try {
        term.resize(cols, rows);
      } catch {}
    };
    const offSize = onMirrorSize(terminalId, ({ cols, rows }) => applySize(cols, rows));

    // Whether the current seed came from a real owner snapshot (vs. the timeout
    // fallback). A fallback seed is provisional — a snapshot arriving later
    // corrects it.
    let seededFromSnapshot = false;

    let snapTimer: ReturnType<typeof setInterval> | null = null;
    const stopSnapTimer = () => {
      if (snapTimer) {
        clearInterval(snapTimer);
        snapTimer = null;
      }
    };
    // Apply the owner's serialized screen as the seed, then release buffered
    // live output. Discard the pre-seed buffer on a real snapshot: it already
    // reflects everything up to the owner's serialize point, so replaying would
    // duplicate scrollback; the sub-frame gap self-heals on the next output.
    const finishSeed = (snapData?: string) => {
      if (seeded) return;
      seeded = true;
      seededFromSnapshot = !!snapData;
      // Always reset first: on a snapshot we replace the screen; on the fallback
      // we must NOT stack post-show output onto the stale pre-hidden screen
      // (the hidden-period output was dropped, so the two don't join cleanly).
      try {
        term.reset();
      } catch {}
      if (snapData) {
        try {
          term.write(snapData);
        } catch {}
      } else {
        for (const d of preSeed) {
          try {
            term.write(d);
          } catch {}
        }
      }
      preSeed.length = 0;
    };
    // Self-heal like the tree channel: keep asking for the owner's snapshot. A
    // bounded wait renders the live buffer so a silent owner never leaves a
    // blank pane (a provisional fallback seed), but we keep asking a few more
    // times afterward so a late snapshot can still replace that provisional
    // screen — then give up.
    const startSeeding = () => {
      seeded = false;
      seededFromSnapshot = false;
      preSeed.length = 0;
      stopSnapTimer();
      requestMirrorSnapshot(terminalId);
      let tries = 0;
      snapTimer = setInterval(() => {
        tries += 1;
        if (tries === 4) finishSeed(); // provisional fallback
        // Keep asking briefly after the fallback so a late snapshot can still
        // replace the provisional screen, then give up (a silent owner never
        // replies — no point re-serializing its scrollback indefinitely).
        if (tries >= 6) {
          stopSnapTimer();
          return;
        }
        requestMirrorSnapshot(terminalId);
      }, 400);
    };
    const offSnap = onMirrorSnapshot(terminalId, ({ data, cols, rows }) => {
      applySize(cols, rows);
      if (!seeded) {
        finishSeed(data);
      } else if (!seededFromSnapshot && data) {
        // A snapshot that lands after we already fell back to the live buffer:
        // re-run the seed to replace the provisional fallback screen with the
        // owner's authoritative one. Once seeded FROM a snapshot there's nothing
        // to fix. preSeed is already empty here, so this only resets + writes.
        seeded = false;
        finishSeed(data);
      }
      if (seededFromSnapshot) stopSnapTimer();
    });

    startSeeding();

    // Re-seed from the current screen when the window is shown after dropping
    // output while hidden (see writeData's memory bound).
    const onVis = () => {
      if (!document.hidden && droppedWhileHidden) {
        droppedWhileHidden = false;
        startSeeding();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    cleanupMirror = () => {
      offSize();
      offSnap();
      stopSnapTimer();
      document.removeEventListener("visibilitychange", onVis);
    };
  } else {
    // Owner: seed a joining mirror's screen, and honor the mirror's DESIRED
    // geometry whenever this window isn't the active one (unfocused or pane
    // hidden) — size authority follows focus. Resize our own xterm to match so
    // this view letterboxes instead of mis-wrapping while the mirror drives.
    const offSnapReq = onMirrorSnapshotRequest(terminalId, () => {
      // Drain xterm's async write queue before serializing, so the snapshot
      // reflects every byte the owner has received — not just its parsed buffer.
      // Under heavy streaming to a throttled owner the unparsed backlog can
      // approach the flow-control window (~100KB); serializing without draining
      // would silently drop it from the mirror's seed.
      term.write("", () => {
        replyMirrorSnapshot(terminalId, {
          data: serialize?.serialize() ?? "",
          cols: term.cols,
          rows: term.rows,
        });
      });
    });
    const offDesired = onMirrorDesired(terminalId, ({ cols, rows }) => {
      if (!cols || !rows) return;
      if (amOwner()) return;
      try {
        term.resize(cols, rows);
      } catch {}
      driveOwnerSize(cols, rows);
    });
    // When this owner was hidden and dropped output (mirror held ack authority),
    // its buffer has a gap; on show, reset and let the live stream repaint rather
    // than render a torn screen. Mirrors the mirror's drop-and-reseed tradeoff.
    const onOwnerVis = () => {
      if (!document.hidden && droppedWhileHidden) {
        droppedWhileHidden = false;
        try {
          term.reset();
        } catch {}
      }
    };
    document.addEventListener("visibilitychange", onOwnerVis);
    cleanupMirror = () => {
      offSnapReq();
      offDesired();
      document.removeEventListener("visibilitychange", onOwnerVis);
    };
  }

  session.destroy = () => {
    textarea?.removeEventListener("paste", handlePaste, true);
    if (typeof cleanupOutput === "function") cleanupOutput();
    if (typeof cleanupExit === "function") cleanupExit();
    window.removeEventListener("focus", onWinFocus);
    cleanupMirror?.();
  };

  return session;
}

function getOrCreateInteractiveSession(terminalId: string, cwd: string): InteractiveSession {
  const existing = interactiveSessions.get(terminalId);
  if (existing) {
    existing.cwd = cwd;
    return existing;
  }
  const session = createInteractiveSession(terminalId, cwd);
  interactiveSessions.set(terminalId, session);
  return session;
}

// Take control of a terminal this window is actively showing while it's focused
// — "the active window owns what it shows." Gated on `presenting` (this is the
// active tab), NOT on layout: a not-yet-controlled view sits display:none behind
// the placeholder, so `offsetParent` would be null there and focusing it — the
// whole point — could never claim. No-op when it's a background tab, the window
// isn't focused, or this window already owns it (so re-focusing doesn't re-claim).
function claimIfActive(session: InteractiveSession, terminalId: string): void {
  if (!session.presenting) return;
  if (!document.hasFocus()) return;
  if (amControlOwner(terminalId)) return;
  TerminalClaimControl(terminalId, REALM.kind, REALM.id, REALM.label)
    .then((owner: ControlOwner) => applyControlOwner(terminalId, owner))
    .catch(() => {});
}

// Re-sync a session's geometry after a trigger that isn't a container resize
// (becoming visible, or an ownership change): fit + re-assert size, since an
// already-fitted xterm emits no onResize on its own.
function resync(session: InteractiveSession, terminalId: string): void {
  reconcileGeometry(session, terminalId);
  session.reassertSize?.();
}

// React to a geometry trigger (mount, container resize, font change, becoming
// visible or focused): the owner fits its xterm to its container and drives the
// shared PTY size, while a mirror never fits (that would mis-wrap the shared
// stream) and instead publishes the size its container could hold. Only the
// control owner drives/proposes size, so an unfocused/non-owning window can never
// fight the active one over the one PTY's geometry.
function reconcileGeometry(session: InteractiveSession, terminalId: string): void {
  // A pane with no layout (hidden tab / a detached project kept mounted but
  // unselected in the main window) has nothing to reconcile — skip before any
  // fit/measure so a window-focus event doesn't fan out to every hidden pane.
  if (session.host.offsetParent === null) return;
  if (IS_MIRROR_WINDOW) {
    // A mirror publishes the size its container wants only while it OWNS the
    // terminal; the PTY owner (main) applies it via ResizeTerminal. A non-owning
    // mirror renders behind a placeholder, so it never proposes a size.
    if (!amControlOwner(terminalId)) return;
    const dims = session.fit.proposeDimensions();
    if (dims && dims.cols && dims.rows) {
      broadcastMirrorDesired(terminalId, { cols: dims.cols, rows: dims.rows });
    }
    return;
  }
  try {
    session.fit.fit();
  } catch {}
}

// The owner focuses its terminal on mount/visible unless the composer already
// holds focus; a mirror never auto-focuses (it can't see the owner window's
// focus, so grabbing it would steal OS focus from the main window mid-action).
function shouldAutoFocus(): boolean {
  return (
    !IS_MIRROR_WINDOW &&
    !document.activeElement?.closest("[data-terminal-composer]")
  );
}

export function InteractivePane({
  terminalId,
  visible = true,
  fontSize = 12,
  onScrollStateChange,
  themeOverride,
  onExit,
  cwd = "",
  ref,
}: InteractivePaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<InteractiveSession | null>(null);
  const filterRef = useRef<FilterMirror | null>(null);
  const fontSizeRef = useRef(fontSize);
  const scrollCallbackRef = useRef(onScrollStateChange);
  const themeOverrideRef = useRef(themeOverride);
  const onExitRef = useRef(onExit);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  fontSizeRef.current = fontSize;
  scrollCallbackRef.current = onScrollStateChange;
  themeOverrideRef.current = themeOverride;
  onExitRef.current = onExit;

  // Clear the buffer and refresh any live filter overlay so both empty at once.
  const clearConsole = () => {
    sessionRef.current?.term.clear();
    filterRef.current?.refresh();
  };

  useImperativeHandle(ref, () => ({
    clear() {
      clearConsole();
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
    setFilter(query: string | null, onCount?: (count: number) => void) {
      const session = sessionRef.current;
      const el = containerRef.current;
      if (!session || !el) return;
      applyFilterQuery(
        filterRef,
        el,
        session,
        () => themeOverrideRef.current ?? getTerminalTheme(el),
        () => fontSizeRef.current,
        query,
        onCount,
      );
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
    // Send composed text to the PTY. A multi-line body is wrapped in bracketed-
    // paste markers (when the program enabled them) so its newlines are pasted
    // content, not executed; the trailing CR submits.
    //
    // With bracketed paste OFF (plain shell) a single-line body goes in one write
    // (body+CR): there's no paste mode to fold the CR into. With bracketed paste ON
    // (an interactive TUI like Claude Code) the CR must be its own pty write — a CR
    // glued to the paste's closing marker is read as pasted content, so the text
    // appears in the input but never submits — so every such body goes through the
    // gated delivery: the CR is a separate write, verified, and re-sent if it drew
    // no redraw. A short/uncollapsible body skips only the pre-write quiet gate (it
    // won't collapse into a "[Pasted text]" placeholder); a longer body, a
    // multi-line body, or an array still gates each part on the receiver going
    // quiet, which also preserves multi-part image order.
    submitInput(input: string | string[]) {
      const session = sessionRef.current;
      if (!session || session.sessionDead) return false;
      // Mirror xterm's bracketTextForPaste: neutralize ESC in the body so the
      // composed text can't smuggle a \x1b[201~ to break out of the paste.
      const wrap = (s: string) => {
        const body = s.replace(/\r?\n/g, "\r");
        return session.term.modes.bracketedPasteMode
          ? `\x1b[200~${body.replace(/\x1b/g, "␛")}\x1b[201~`
          : body;
      };
      const fail = () => session.handleWriteError?.();
      // lpm clears the composer once this returns true, so a re-entrant submit
      // would interleave its writes into an in-flight one; refuse it (the draft is
      // kept). The glued body+CR path honors this too though it never sets the flag
      // — it must not splice a body+CR into a running multi-part delivery.
      if (session.delivering) return false;

      const bracketed = session.term.modes.bracketedPasteMode;

      // Plain shell (no bracketed paste): a single-line body+CR ships in one
      // zero-latency write, since there's no paste mode to fold the CR into.
      if (typeof input === "string" && canGlueCr(input, bracketed)) {
        sendTerminalInput(terminalId, `${wrap(input)}\r`).catch(fail);
        return true;
      }

      const parts = (Array.isArray(input) ? input : [input]).filter((p) => p.length > 0);
      if (parts.length === 0) return false;
      session.delivering = true;

      // Resolves true if `ready` became true, false if it hit the ceiling first.
      const waitUntil = (ready: () => boolean, ceiling: number, sentAt: number) =>
        new Promise<boolean>((resolve) => {
          const check = () => {
            if (ready()) resolve(true);
            else if (performance.now() - sentAt >= ceiling) resolve(false);
            else setTimeout(check, QUIET_POLL_MS);
          };
          setTimeout(check, QUIET_POLL_MS);
        });
      const settled = () => performance.now() - session.lastOutputAt >= PASTE_QUIET_MS;
      // Wait for `gate`; if the ceiling fires without it settling — the receiver is
      // still redrawing (e.g. an animating spinner keeps output fresh so quiet never
      // arrives) — grant one more bounded quiet window rather than writing
      // mid-redraw. If it still never settles, proceed anyway (never hang forever).
      const waitGated = async (gate: () => boolean, ceiling: number, sentAt: number) => {
        if (await waitUntil(gate, ceiling, sentAt)) return;
        await waitUntil(gate, ceiling, performance.now());
      };

      // baseY..length is the viewport; the count climbs once Claude Code lifts a
      // pasted path into an image placeholder.
      const visibleImageMarks = () => {
        const buf = session.term.buffer.active;
        let marks = 0;
        for (let i = buf.baseY; i < buf.length; i++) {
          marks += countImageMarkers(buf.getLine(i)?.translateToString(true) ?? "");
        }
        return marks;
      };

      // Submit, then verify. A real submit redraws immediately, so if no output at
      // all follows the CR within the grace window it was swallowed mid-collapse:
      // wait for quiet again (bounded) and re-send, up to CR_MAX_RETRIES. When
      // output DID follow, never retry — the message likely landed and a stray
      // extra Enter (e.g. into a permission dialog) would be harmful.
      const submitCr = async () => {
        for (let attempt = 0; ; attempt++) {
          if (session.sessionDead) return;
          await sendTerminalInput(terminalId, "\r");
          const crSentAt = performance.now();
          await waitUntil(() => session.lastOutputAt >= crSentAt, CR_VERIFY_GRACE_MS, crSentAt);
          if (!crWasSwallowed(session.lastOutputAt, crSentAt)) return;
          if (attempt >= CR_MAX_RETRIES) return;
          await waitGated(settled, PASTE_CEILING_MS, performance.now());
        }
      };

      // A lone short/uncollapsible body needs no pre-write quiet gate — it never
      // lifts into a "[Pasted text]" placeholder, so nothing is mid-collapse when
      // we write it — but its CR must still be a separate verified write, so it
      // rides the same delivery as one ungated part. A longer/multi-part body keeps
      // the per-part gate. (canGlueCr already peeled off the plain-shell case.)
      const skipPartGate = parts.length === 1 && canSkipQuietGate(parts[0], bracketed);
      const deliver = async () => {
        for (const part of parts) {
          if (session.sessionDead) return;
          // An image path resolves async and silently, so gate it on its placeholder
          // appearing rather than on quiet, else the next part overtakes its cursor
          // slot. sentAt is sampled after the write so in-flight output can't satisfy
          // the gate early.
          const isImage = bracketed && !/[\r\n]/.test(part) && IMAGE_EXT_RE.test(part.trim());
          const before = isImage ? visibleImageMarks() : 0;
          await sendTerminalInput(terminalId, wrap(part));
          const sentAt = performance.now();
          if (isImage) await waitUntil(() => visibleImageMarks() > before && settled(), PASTE_IMAGE_CEILING_MS, sentAt);
          else if (!skipPartGate) await waitGated(() => session.lastOutputAt >= sentAt && settled(), PASTE_CEILING_MS, sentAt);
        }
        await submitCr();
      };
      deliver()
        .catch(fail)
        .finally(() => {
          session.delivering = false;
        });
      return true;
    },
  }));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    initFileDrop();

    const session = getOrCreateInteractiveSession(terminalId, cwd);
    sessionRef.current = session;

    session.term.options.fontSize = fontSize;
    session.term.options.theme =
      themeOverrideRef.current ?? getTerminalTheme(el);
    session.themeOverride = themeOverrideRef.current ?? null;
    session.onScrollState = (atBottom) => scrollCallbackRef.current?.(atBottom);
    session.onAfterClear = () => filterRef.current?.refresh();
    session.onExit = (code) => onExitRef.current?.(code);

    el.appendChild(session.host);

    // A mirror renders at the owner's cols/rows (see the mirror-size handler),
    // so it never fits to its own container — fitting would resize the term
    // away from the owner's geometry and mis-wrap the shared stream. Instead it
    // publishes its container's DESIRED size, which the owner honors while the
    // owner's own pane is hidden.
    reconcileGeometry(session, terminalId);

    // Resize observer — debounced at 200ms to avoid garbled redraws during
    // the sidebar's CSS transition (transition-[width] duration-200)
    let resizeTimer = 0;
    const ro = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeTimer = 0;
        if (!session.host.clientWidth || !session.host.clientHeight) return;
        reconcileGeometry(session, terminalId);
      }, 200);
    });
    ro.observe(session.host);

    // A new terminal's composer claims focus in its mount layout-effect, which
    // runs before this passive effect; don't yank focus back to the terminal
    // when the open terminal-input already holds it.
    if (shouldAutoFocus()) {
      session.term.focus();
    }

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      ro.disconnect();
      session.onScrollState = undefined;
      session.onExit = undefined;
      session.onAfterClear = undefined;
      filterRef.current?.dispose();
      filterRef.current = null;
      if (session.host.parentNode) {
        session.host.parentNode.removeChild(session.host);
      }
      sessionRef.current = null;
      setMenu(null);
    };
  }, [terminalId]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.themeOverride = themeOverride ?? null;
    const theme = themeOverride ?? getTerminalTheme(containerRef.current);
    session.term.options.theme = theme;
    filterRef.current?.setTheme(theme);
  }, [themeOverride]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.term.options.fontSize = fontSize;
    filterRef.current?.setFontSize(fontSize);
    reconcileGeometry(session, terminalId);
  }, [fontSize]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.cwd = cwd;
  }, [cwd]);

  useEffect(() => {
    if (!visible) {
      filterRef.current?.setQuery(null);
      return;
    }
    const session = sessionRef.current;
    if (!session) return;
    const term = session.term;
    requestAnimationFrame(() => {
      resync(session, terminalId);
      try {
        term.refresh(0, term.rows - 1);
      } catch {}
      // Don't yank focus out of an open terminal-input composer that just
      // claimed it on a tab switch (it focuses synchronously, before this rAF).
      if (shouldAutoFocus()) {
        term.focus();
      }
    });
  }, [visible]);

  // Presence + focus-follows control: while its pane is the visible active tab,
  // this window shows the terminal. If the window is focused it OWNS it (claim →
  // the other surface flips to its "take control" placeholder); if not, it just
  // presents as a candidate owner. Claim also registers the presenter, so it
  // subsumes present. Later window-focus events re-claim via `onWinFocus`.
  // Unpresenting on hide/unmount transfers ownership to a remaining presenter
  // instead of stranding it on a window that no longer shows the terminal.
  useEffect(() => {
    if (!visible) return;
    const session = sessionRef.current;
    if (session) session.presenting = true;
    const call = document.hasFocus()
      ? TerminalClaimControl(terminalId, REALM.kind, REALM.id, REALM.label)
      : TerminalPresentControl(terminalId, REALM.kind, REALM.id, REALM.label);
    // A deferring present isn't broadcast, so learn the owner from the return.
    call.then((owner: ControlOwner) => applyControlOwner(terminalId, owner)).catch(
      () => {},
    );
    return () => {
      if (session) session.presenting = false;
      TerminalUnpresentControl(terminalId, REALM.kind, REALM.id).catch(() => {});
    };
  }, [terminalId, visible]);

  // When this terminal's owner changes (we took control, another surface did, or
  // the previous owner left), re-fit + re-drive geometry so a newly-owning window
  // sizes the PTY to its own container immediately.
  useEffect(() => {
    return onControlChange((id) => {
      if (id !== terminalId) return;
      const session = sessionRef.current;
      if (session) resync(session, terminalId);
    });
  }, [terminalId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={containerRef}
        onContextMenu={(e) => {
          if (!sessionRef.current) return;
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
      />
      {menu && sessionRef.current && (
        <ConsoleContextMenu
          x={menu.x}
          y={menu.y}
          term={sessionRef.current.term}
          serialize={sessionRef.current.serialize}
          canPaste
          filter={filterRef.current}
          appCopyAvailable={sessionRef.current.canAppCopy()}
          onAppCopy={() => sessionRef.current?.tryAppCopy()}
          onClear={clearConsole}
          onPaste={() => {
            navigator.clipboard
              .readText()
              .then((text) => {
                if (text) sessionRef.current?.term.paste(text);
              })
              .catch(() => {});
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
