import { getCurrentWindow } from "@tauri-apps/api/window";
import { SetInterfaceSize } from "../bridge/commands";
import { EventsOn } from "../bridge/runtime";
import { interfaceZoom, useInterfaceZoom } from "./interfaceZoom";
import { isWindows } from "./platform";

// The interface size: how big lpm draws its sidebar, menus and dialogs, from
// Settings › General and View › Bigger, Smaller and Actual Size. The webview
// zooms the page (interface_size.rs), in every window at once; terminal text
// keeps its own size (useTerminalFontSize).

export const INTERFACE_SIZES = [0.9, 1, 1.1, 1.25] as const;

/** The offered size nearest `value`; unset or unreadable is 100%. */
export function interfaceSizeOf(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return INTERFACE_SIZES.reduce((best, size) =>
    Math.abs(size - value) < Math.abs(best - value) ? size : best,
  );
}

/** One size up (`step` > 0) or down (< 0) from `size`, or back to 100% (0). */
export function steppedInterfaceSize(size: number, step: number): number {
  if (step === 0) return 1;
  const at = INTERFACE_SIZES.indexOf(interfaceSizeOf(size) as (typeof INTERFACE_SIZES)[number]);
  const next = Math.min(INTERFACE_SIZES.length - 1, Math.max(0, at + Math.sign(step)));
  return INTERFACE_SIZES[next];
}

export function interfaceSizeLabel(size: number): string {
  return `${Math.round(size * 100)}%`;
}

// WebKit (macOS, Linux) keeps devicePixelRatio at the screen's scale while it
// zooms the page, so a canvas, the terminal's above all, would be drawn at the
// old resolution and stretched soft. Report the ratio the zoomed page is
// really drawn at; xterm reads it again on the resize that follows. Chromium
// (Windows) folds the zoom in by itself.
let screenScale: number | null = null;

function matchPixelRatio(): void {
  if (isWindows) return;
  const zoom = interfaceZoom();
  if (zoom === 1 || screenScale === null) {
    if (Object.prototype.hasOwnProperty.call(window, "devicePixelRatio")) {
      delete (window as { devicePixelRatio?: number }).devicePixelRatio;
    }
  } else {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      get: () => (screenScale ?? 1) * interfaceZoom(),
    });
  }
  window.dispatchEvent(new Event("resize"));
}

function drawnAt(zoom: number): void {
  if (zoom === interfaceZoom()) return;
  useInterfaceZoom.setState({ zoom });
  matchPixelRatio();
}

/** Draws lpm at `size` in every window; this one follows at once, the others
 *  on the event the backend sends them. */
export async function applyInterfaceSize(size: unknown): Promise<void> {
  try {
    drawnAt(interfaceSizeOf(await SetInterfaceSize(interfaceSizeOf(size))));
  } catch {
    // An older backend has no zoom; the page stays at 100%.
  }
}

/** Follows the size another window set, and the screen this one is on. */
export function initInterfaceSize(): void {
  EventsOn("interface-size", (zoom: unknown) => drawnAt(interfaceSizeOf(zoom)));
  if (isWindows) return;
  const win = getCurrentWindow();
  const setScale = (scale: unknown) => {
    screenScale = typeof scale === "number" && scale > 0 ? scale : null;
    if (interfaceZoom() !== 1) matchPixelRatio();
  };
  win.scaleFactor().then(setScale, () => {});
  void win.onScaleChanged(({ payload }) => setScale(payload.scaleFactor)).catch(() => {});
}
