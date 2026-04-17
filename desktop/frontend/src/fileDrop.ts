import { OnFileDrop, OnFileDropOff } from "../wailsjs/runtime/runtime";

// Wails only accepts a single OnFileDrop registration per page, so this module
// owns that registration and dispatches drops to per-feature handlers (notes,
// terminals, ...) in registration order. A handler returns true to mark the
// drop consumed; dispatching stops there.
export type FileDropHandler = (
  x: number,
  y: number,
  paths: string[],
) => boolean | void;

const handlers: { id: string; fn: FileDropHandler }[] = [];
let initialized = false;

function ensureInit() {
  if (initialized) return;
  initialized = true;
  OnFileDrop((x, y, paths) => {
    for (const h of handlers) {
      if (h.fn(x, y, paths) === true) return;
    }
  }, false);
}

export function registerFileDropHandler(
  id: string,
  fn: FileDropHandler,
): () => void {
  ensureInit();
  handlers.push({ id, fn });
  return () => {
    const i = handlers.findIndex((h) => h.id === id && h.fn === fn);
    if (i >= 0) handlers.splice(i, 1);
  };
}

// Vite HMR: drop the singleton Wails registration and clear handlers so the
// fresh module replaces them without duplicates.
const viteHot = (
  import.meta as ImportMeta & { hot?: { dispose: (cb: () => void) => void } }
).hot;
if (viteHot) {
  viteHot.dispose(() => {
    OnFileDropOff();
    handlers.length = 0;
    initialized = false;
  });
}
