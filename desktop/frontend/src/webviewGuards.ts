import { isMac, isWindows } from "./platform";

const TEXT_INPUT_TYPES = new Set(["", "text", "search", "url", "email", "password", "number", "tel"]);

function isEditable(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return !target.disabled;
  if (target instanceof HTMLInputElement) return !target.disabled && TEXT_INPUT_TYPES.has(target.type);
  return target instanceof HTMLElement && target.isContentEditable;
}

function insideSelection(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
  return sel.getRangeAt(0).intersectsNode(target);
}

// The engine's own menu stays where it edits or copies text. Everywhere else
// WebKitGTK and WebView2 offer Back/Reload, and Reload remounts every terminal.
// In a dev build Shift keeps it, for Inspect.
export function keepsEngineContextMenu(
  e: Pick<MouseEvent, "target" | "shiftKey">,
  dev: boolean,
): boolean {
  if (dev && e.shiftKey) return true;
  return isEditable(e.target) || insideSelection(e.target);
}

type KeyLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

const CTRL_BROWSER_KEYS = new Set(["r", "f", "g", "p", "s"]);
const BARE_BROWSER_KEYS = new Set(["F3", "F5", "BrowserBack", "BrowserForward", "BrowserRefresh", "BrowserSearch"]);

// WebView2 runs these against the app page itself when nothing in the app
// claimed the key: reload, find, print, save page, history navigation.
export function isBrowserAccelerator(e: KeyLike): boolean {
  if (e.metaKey) return false;
  if (BARE_BROWSER_KEYS.has(e.key)) return !e.altKey;
  if (e.altKey) return !e.ctrlKey && (e.key === "ArrowLeft" || e.key === "ArrowRight");
  return e.ctrlKey && CTRL_BROWSER_KEYS.has(e.key.toLowerCase());
}

// Bubble phase, after the app's own handlers: anything they claimed already
// carries defaultPrevented and is left alone.
export function installWebviewGuards(target: Window = window, dev: boolean = import.meta.env.DEV) {
  if (isMac) return;
  target.addEventListener("contextmenu", (e) => {
    if (!e.defaultPrevented && !keepsEngineContextMenu(e, dev)) e.preventDefault();
  });
  if (!isWindows) return;
  target.addEventListener("keydown", (e) => {
    if (!e.defaultPrevented && isBrowserAccelerator(e)) e.preventDefault();
  });
}
