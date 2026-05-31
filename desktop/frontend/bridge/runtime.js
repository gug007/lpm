// Runtime shim (events / open-url / window drag / file-drop), backed by
// @tauri-apps/api. Keeps the frontend files that import from this path working
// through a single stable surface.
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { openUrl } from "@tauri-apps/plugin-opener";

// Tauri's listen() is async (returns Promise<UnlistenFn>) but callers expect a
// synchronous unsubscribe, so bridge the race: if unsubscribed before the
// listener attaches, tear it down as soon as it does.
export function EventsOn(eventName, callback) {
  let unlisten = null;
  let cancelled = false;
  listen(eventName, (event) => callback(event.payload)).then((fn) => {
    if (cancelled) fn();
    else unlisten = fn;
  });
  return () => {
    cancelled = true;
    if (unlisten) unlisten();
  };
}

export function EventsEmit(eventName, data) {
  void emit(eventName, data);
}

export function BrowserOpenURL(url) {
  void openUrl(url);
}

export async function WindowGetSize() {
  const win = getCurrentWindow();
  const [phys, scale] = await Promise.all([win.innerSize(), win.scaleFactor()]);
  const sf = scale || 1;
  return { w: Math.round(phys.width / sf), h: Math.round(phys.height / sf) };
}

// File drop bridge. Tauri delivers native drag/drop via the webview's
// onDragDropEvent; re-publish it as the `app:*` CustomEvents the drag
// overlay listens for, and invoke the registered drop handler. Coordinates
// from Tauri are physical pixels; the overlay's elementFromPoint() needs CSS
// pixels, so divide by devicePixelRatio.
let fileDropHandler = null;
let dragSubscribed = false;

function toLogical(position) {
  const dpr = window.devicePixelRatio || 1;
  if (!position) return { x: 0, y: 0 };
  return { x: Math.round(position.x / dpr), y: Math.round(position.y / dpr) };
}

function ensureDragSubscription() {
  if (dragSubscribed) return;
  dragSubscribed = true;
  void getCurrentWebview().onDragDropEvent((event) => {
    const p = event.payload;
    switch (p.type) {
      case "enter": {
        const { x, y } = toLogical(p.position);
        window.dispatchEvent(new CustomEvent("app:handleDragEnter"));
        window.dispatchEvent(new CustomEvent("app:handleDragOver", { detail: [x, y] }));
        break;
      }
      case "over": {
        const { x, y } = toLogical(p.position);
        window.dispatchEvent(new CustomEvent("app:handleDragOver", { detail: [x, y] }));
        break;
      }
      case "leave":
        window.dispatchEvent(new CustomEvent("app:handleDragLeave"));
        break;
      case "drop": {
        const { x, y } = toLogical(p.position);
        window.dispatchEvent(new CustomEvent("app:filesDropped"));
        if (fileDropHandler) fileDropHandler(x, y, p.paths ?? []);
        break;
      }
    }
  });
}

export function OnFileDrop(callback) {
  fileDropHandler = callback;
  ensureDragSubscription();
}

export function OnFileDropOff() {
  fileDropHandler = null;
}

// Window dragging. The app marks draggable chrome with the inheriting CSS
// custom property `--app-draggable: drag` (class `.app-drag`) and excludes
// interactive bits with `--app-draggable: no-drag`. Tauri has no native
// equivalent, so translate: on primary-button mousedown, if the target's
// computed `--app-draggable` resolves to "drag", start an OS window drag
// (double-click toggles maximize). Keeps all component markup unchanged.
function initWindowDrag() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const win = getCurrentWindow();
  const isDrag = (target) => {
    if (!(target instanceof Element)) return false;
    return getComputedStyle(target).getPropertyValue("--app-draggable").trim() === "drag";
  };
  document.addEventListener(
    "mousedown",
    (e) => {
      if (e.button !== 0 || !isDrag(e.target)) return;
      e.preventDefault();
      void win.startDragging().catch(() => {});
    },
    { capture: true },
  );
  document.addEventListener("dblclick", (e) => {
    if (e.button !== 0 || !isDrag(e.target)) return;
    void win.toggleMaximize().catch(() => {});
  });
}

initWindowDrag();
