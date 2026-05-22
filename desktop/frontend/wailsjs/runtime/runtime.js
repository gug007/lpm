// v2-shaped runtime shim, backed by @wailsio/runtime (Wails v3). Keeps the
// 52 frontend files that import from this path working without changes.
import { Events, Browser, Window } from "@wailsio/runtime";

export function EventsOn(eventName, callback) {
  return Events.On(eventName, (ev) => {
    callback(ev.data);
  });
}

export function EventsEmit(eventName, data) {
  Events.Emit(eventName, data).catch(() => {});
}

export function BrowserOpenURL(url) {
  void Browser.OpenURL(url);
}

export async function WindowGetSize() {
  const s = await Window.Size();
  return { w: s.width, h: s.height };
}

// File drop bridge — Go side re-emits WindowFilesDropped as `files-dropped`.
// v3 only delivers drops landing on an element with `data-file-drop-target`,
// so mark the body to restore v2's "drop anywhere on the window" contract.
let fileDropHandler = null;
let fileDropUnsub = null;

function ensureBodyIsDropTarget() {
  if (typeof document === "undefined") return;
  const body = document.body;
  if (body && !body.hasAttribute("data-file-drop-target")) {
    body.setAttribute("data-file-drop-target", "");
  }
}

// v3 swallows DOM dragover on macOS, so re-publish coordinates from v3's
// native callback as a CustomEvent the rest of the app can listen for.
let dragHooksInstalled = false;
function installDragHooks() {
  if (dragHooksInstalled || typeof window === "undefined") return;
  dragHooksInstalled = true;
  const w = window;
  w._wails = w._wails || {};
  const queue = [];
  const flush = () => {
    while (queue.length) {
      const ev = queue.shift();
      const orig = w._wails[ev.method];
      if (typeof orig === "function") orig.apply(w._wails, ev.args);
      window.dispatchEvent(new CustomEvent(`wails:${ev.method}`, { detail: ev.args }));
    }
  };
  const wrap = (method) => {
    let installed = false;
    const tryInstall = () => {
      if (installed) return;
      const orig = w._wails[method];
      if (typeof orig !== "function") return;
      installed = true;
      w._wails[method] = (...args) => {
        const r = orig.apply(w._wails, args);
        window.dispatchEvent(new CustomEvent(`wails:${method}`, { detail: args }));
        return r;
      };
    };
    // Try now; if the runtime hasn't attached yet, retry on first call via a
    // defineProperty trap so we don't miss the assignment.
    tryInstall();
    if (installed) return;
    let stored;
    Object.defineProperty(w._wails, method, {
      configurable: true,
      get() { return stored; },
      set(v) {
        stored = (...args) => {
          const r = v.apply(w._wails, args);
          window.dispatchEvent(new CustomEvent(`wails:${method}`, { detail: args }));
          return r;
        };
      },
    });
  };
  wrap("handleDragEnter");
  wrap("handleDragOver");
  wrap("handleDragLeave");
  flush();
}

export function OnFileDrop(callback) {
  ensureBodyIsDropTarget();
  installDragHooks();
  fileDropHandler = callback;
  if (fileDropUnsub) fileDropUnsub();
  fileDropUnsub = Events.On("files-dropped", (ev) => {
    const d = ev.data || {};
    window.dispatchEvent(new CustomEvent("wails:filesDropped", { detail: d }));
    if (!fileDropHandler) return;
    fileDropHandler(d.x ?? 0, d.y ?? 0, d.paths ?? []);
  });
}

export function OnFileDropOff() {
  fileDropHandler = null;
  if (fileDropUnsub) {
    fileDropUnsub();
    fileDropUnsub = null;
  }
}
