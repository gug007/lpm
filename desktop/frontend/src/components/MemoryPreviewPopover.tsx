import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { relativeTime } from "../relativeTime";
import type { MemorySessionInfo } from "../hooks/useMemorySessions";

const GAP = 8;
const EDGE_MARGIN = 8;

interface MemoryPreviewPopoverProps {
  session: MemorySessionInfo | undefined;
  anchor: DOMRect;
}

type Pos = { top: number; left: number; placement: "top" | "bottom" };

// Hover preview for the composer's "/lpm-memory <session-id>" pill — the memory
// twin of ImagePreviewPopover, sharing its measurement and placement recipe.
export function MemoryPreviewPopover({ session, anchor }: MemoryPreviewPopoverProps) {
  const [pos, setPos] = useState<Pos | null>(null);
  const ref = useRef<HTMLDivElement>(null);

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
  }, [session, reposition]);

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
      className={`pointer-events-none fixed z-[9999] w-[300px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] shadow-[0_8px_24px_rgba(0,0,0,0.22)] ${
        pos ? (pos.placement === "bottom" ? "image-preview-pop image-preview-pop-below" : "image-preview-pop") : ""
      }`}
    >
      {session ? (
        <>
          <div className="flex items-baseline gap-2 border-b border-[var(--border)] px-3 py-1.5">
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-primary)]">
              {session.title}
            </span>
            <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
              {relativeTime(session.updatedAt)}
            </span>
          </div>
          <div className="max-h-[200px] overflow-hidden whitespace-pre-wrap px-3 py-2 font-mono text-[11px] leading-4 text-[var(--text-secondary)]">
            {session.preview}
          </div>
        </>
      ) : (
        <div className="flex h-16 items-center justify-center px-2 text-center text-[11px] text-[var(--text-muted)]">
          Preview unavailable
        </div>
      )}
    </div>,
    document.body,
  );
}
