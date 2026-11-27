import { useRef } from "react";
import { createPortal } from "react-dom";
import { relativeTime } from "../relativeTime";
import { useAnchoredPosition } from "../hooks/useAnchoredPosition";
import type { MemorySessionInfo } from "../hooks/useMemorySessions";

interface MemoryPreviewPopoverProps {
  session: MemorySessionInfo | undefined;
  anchor: DOMRect;
}

// Hover preview for the composer's "/lpm-memory <session-id>" pill — the memory
// twin of ImagePreviewPopover.
export function MemoryPreviewPopover({ session, anchor }: MemoryPreviewPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { style, placement } = useAnchoredPosition(ref, anchor, "center");

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{ ...style, transformOrigin: placement === "bottom" ? "top center" : "bottom center" }}
      className={`pointer-events-none fixed z-[9999] w-[300px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] shadow-[0_8px_24px_rgba(0,0,0,0.22)] ${
        placement ? (placement === "bottom" ? "image-preview-pop image-preview-pop-below" : "image-preview-pop") : ""
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
