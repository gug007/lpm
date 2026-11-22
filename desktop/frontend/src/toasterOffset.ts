export const TOAST_EDGE = 12;
const TOAST_WIDTH = 356;
// A floor reaching higher than this still leaves a toast this much window above it.
const TOAST_ROOM = 160;

// Close-with-undo toasts keep to the footer row's left end, clear of every
// pane's composer and its Send button.
export const FOOTER_TOASTER_ID = "footer";
export const FOOTER_TOASTER_OFFSET = { bottom: 4, left: 12 };

/** Toasts stack up from the bottom right, just above whatever the window keeps
 *  under them there — the footer row, the composer in a pane that has one, and
 *  the mini views — so a toast never covers Send, the Git buttons that raised
 *  it, or a kept tab. Elements that count are marked `data-toast-floor`. */
export function toastFloor(
  right: number,
  root: ParentNode = document,
  viewport = { width: window.innerWidth, height: window.innerHeight },
): number {
  const left = viewport.width - right - TOAST_WIDTH;
  let top = viewport.height;
  for (const el of root.querySelectorAll<HTMLElement>("[data-toast-floor]")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.right <= left || r.left >= viewport.width - right) continue;
    top = Math.min(top, r.top);
  }
  return Math.min(Math.round(viewport.height - top) + TOAST_EDGE, viewport.height - TOAST_ROOM);
}
