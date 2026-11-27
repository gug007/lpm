import { useRef } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPosition } from "../hooks/useAnchoredPosition";
import { useImageDataUrl } from "./imageDataUrl";

interface ImagePreviewPopoverProps {
  path: string;
  anchor: DOMRect;
  // Peer slug when the file lives on a paired host rather than this machine.
  slug?: string | null;
}

export function ImagePreviewPopover({ path, anchor, slug }: ImagePreviewPopoverProps) {
  const { url, failed } = useImageDataUrl(path, slug);
  const ref = useRef<HTMLDivElement>(null);
  const { style, placement } = useAnchoredPosition(ref, anchor, "center");

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{ ...style, transformOrigin: placement === "bottom" ? "top center" : "bottom center" }}
      className={`pointer-events-none fixed z-[9999] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.22)] ${
        placement ? (placement === "bottom" ? "image-preview-pop image-preview-pop-below" : "image-preview-pop") : ""
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
