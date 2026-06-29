import { useEffect, useRef, useState } from "react";
import { Lightbulb, Minus, Plus } from "lucide-react";
import { Modal } from "./ui/Modal";
import { APP_TIPS } from "./appTips";
import { renderSegments } from "./KeyCombo";

interface AppTipsModalProps {
  open: boolean;
  onClose: () => void;
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

const clampZoom = (z: number) =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +z.toFixed(2)));

const touchDist = (t: TouchList) =>
  Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

export function AppTipsModal({ open, onClose }: AppTipsModalProps) {
  const [zoom, setZoom] = useState(1);
  const listRef = useRef<HTMLUListElement>(null);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;

  useEffect(() => {
    if (open) setZoom(1);
  }, [open]);

  // Pinch-to-zoom: a trackpad pinch reaches WebKit as a ctrl+wheel event, and a
  // touchscreen sends two-finger touches. Listen natively so we can preventDefault
  // the browser's own page zoom and drive the modal's zoom instead.
  useEffect(() => {
    const el = listRef.current;
    if (!el || !open) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => clampZoom(z * Math.exp(-e.deltaY * 0.01)));
    };

    let startDist = 0;
    let startZoom = 1;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      startDist = touchDist(e.touches);
      startZoom = zoomRef.current;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || startDist === 0) return;
      e.preventDefault();
      setZoom(clampZoom(startZoom * (touchDist(e.touches) / startDist)));
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      zIndexClassName="z-[60]"
      contentClassName="flex max-h-[80vh] w-[1040px] max-w-[94vw] flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-4">
        <Lightbulb className="h-4 w-4 text-[var(--accent-amber)]" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          All tips
        </h3>
        <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
          {APP_TIPS.length}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
            disabled={zoom <= ZOOM_MIN}
            aria-label="Zoom out"
            title="Zoom out"
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            aria-label="Reset zoom"
            title="Reset zoom"
            className="w-[42px] rounded py-0.5 text-center text-[11px] tabular-nums text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
            disabled={zoom >= ZOOM_MAX}
            aria-label="Zoom in"
            title="Zoom in"
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
      <ul
        ref={listRef}
        className="flex flex-col overflow-auto p-2"
        style={{ zoom, touchAction: "pan-y" }}
      >
        {APP_TIPS.map((tip) => (
          <li
            key={tip.id}
            className="flex flex-wrap items-center gap-1 rounded-lg px-3 py-2 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          >
            {renderSegments(tip.segments)}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
