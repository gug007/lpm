import { useCallback, useEffect, useRef, useState } from "react";
import { useEventListener } from "./useEventListener";

export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 2.5;
const ZOOM_BASE = 1;
const ZOOM_STEP = 0.1;
// Wheel/pinch deltas are far finer than a keystroke; this maps a notch to a
// fraction of a step so the gesture feels continuous.
const WHEEL_SCALE = 0.01;

const clamp = (v: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +v.toFixed(2)));

function loadZoom(key: string | undefined): number {
  if (!key) return ZOOM_BASE;
  try {
    const stored = Number(localStorage.getItem(key));
    return stored > 0 ? clamp(stored) : ZOOM_BASE;
  } catch {
    return ZOOM_BASE;
  }
}

export interface ContentZoom {
  zoom: number;
  percent: number;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  // Attach to the zoomable surface to enable ⌘-scroll / trackpad pinch on it.
  surfaceRef: (el: HTMLElement | null) => void;
}

// Reader zoom for a text surface: ⌘+ / ⌘− / ⌘0, plus ⌘-scroll and trackpad
// pinch (which arrives as a wheel event with ctrlKey) over the surface itself.
// The keys are taken in the capture phase and swallowed so the app-wide
// terminal-font shortcut doesn't fire alongside them; `storageKey` remembers the
// level across mounts.
export function useContentZoom(enabled: boolean, storageKey?: string): ContentZoom {
  const [zoom, setZoom] = useState(() => loadZoom(storageKey));
  const [surface, setSurface] = useState<HTMLElement | null>(null);
  const wheel = useRef({ delta: 0, scheduled: false });

  const apply = useCallback((next: (z: number) => number) => {
    setZoom((z) => clamp(next(z)));
  }, []);

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, String(zoom));
    } catch {
      /* storage unavailable — the level just won't survive the mount */
    }
  }, [storageKey, zoom]);

  const zoomIn = useCallback(() => apply((z) => z + ZOOM_STEP), [apply]);
  const zoomOut = useCallback(() => apply((z) => z - ZOOM_STEP), [apply]);
  const zoomReset = useCallback(() => apply(() => ZOOM_BASE), [apply]);

  useEventListener(
    "keydown",
    (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const step =
        e.key === "=" || e.key === "+"
          ? zoomIn
          : e.key === "-" || e.key === "_"
            ? zoomOut
            : e.key === "0"
              ? zoomReset
              : null;
      if (!step) return;
      e.preventDefault();
      e.stopPropagation();
      step();
    },
    window,
    enabled,
    true,
  );

  // Bound on the surface (not the window) and non-passive, since preventDefault
  // is what keeps the pinch from zooming the whole webview.
  useEffect(() => {
    if (!enabled || !surface) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      wheel.current.delta += e.deltaY;
      if (wheel.current.scheduled) return;
      wheel.current.scheduled = true;
      requestAnimationFrame(() => {
        const { delta } = wheel.current;
        wheel.current = { delta: 0, scheduled: false };
        apply((z) => z - delta * WHEEL_SCALE);
      });
    };
    surface.addEventListener("wheel", onWheel, { passive: false });
    return () => surface.removeEventListener("wheel", onWheel);
  }, [enabled, surface, apply]);

  return {
    zoom,
    percent: Math.round(zoom * 100),
    zoomIn,
    zoomOut,
    zoomReset,
    canZoomIn: zoom < ZOOM_MAX,
    canZoomOut: zoom > ZOOM_MIN,
    surfaceRef: setSurface,
  };
}
