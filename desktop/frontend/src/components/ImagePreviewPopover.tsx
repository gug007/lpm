import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useImageDataUrl } from "./imageDataUrl";

const GAP = 8;
const EDGE_MARGIN = 8;

interface ImagePreviewPopoverProps {
  path: string;
  anchor: DOMRect;
}

type Pos = { top: number; left: number; placement: "top" | "bottom" };

export function ImagePreviewPopover({ path, anchor }: ImagePreviewPopoverProps) {
  const { url, failed } = useImageDataUrl(path);
  const [pos, setPos] = useState<Pos | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Measure with offsetWidth/Height (not getBoundingClientRect): those ignore
  // CSS transforms, so the entrance animation's scale can't corrupt the layout
  // math. The image's natural size isn't known until it decodes, so this runs
  // again from a ResizeObserver once the box grows — without it the first hover
  // is positioned against the empty (loading) box and lands in the wrong place.
  const reposition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let placement: "top" | "bottom" = "top";
    let top = anchor.top - h - GAP;
    if (top < EDGE_MARGIN) {
      top = anchor.bottom + GAP;
      placement = "bottom";
    }
    let left = anchor.left + anchor.width / 2 - w / 2;
    left = Math.max(EDGE_MARGIN, Math.min(left, window.innerWidth - EDGE_MARGIN - w));
    top = Math.max(EDGE_MARGIN, Math.min(top, window.innerHeight - EDGE_MARGIN - h));
    setPos({ top, left, placement });
  }, [anchor]);

  useLayoutEffect(() => {
    reposition();
  }, [url, failed, reposition]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => reposition());
    ro.observe(el);
    return () => ro.disconnect();
  }, [reposition]);

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        visibility: pos ? "visible" : "hidden",
        transformOrigin: pos?.placement === "bottom" ? "top center" : "bottom center",
      }}
      className={`pointer-events-none fixed z-[9999] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.22)] ${
        pos ? (pos.placement === "bottom" ? "image-preview-pop image-preview-pop-below" : "image-preview-pop") : ""
      }`}
    >
      {url ? (
        <img src={url} alt="" className="block max-h-[220px] max-w-[260px] rounded object-contain" />
      ) : failed ? (
        <div className="flex h-16 w-24 items-center justify-center px-2 text-center text-[11px] text-[var(--text-muted)]">
          Preview unavailable
        </div>
      ) : (
        <div className="flex h-16 w-24 items-center justify-center text-[11px] text-[var(--text-muted)]">
          Loading…
        </div>
      )}
    </div>,
    document.body,
  );
}
