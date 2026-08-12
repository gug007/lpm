import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const GAP = 8;
const MARGIN = 8;
export const USAGE_POPOVER_WIDTH = 460;

/** Floats the full usage card beside a sidebar row. Portaled so the sidebar's
 *  own scrolling and stacking cannot clip it, and measured before it is shown
 *  so it never flashes in the wrong place. */
export function SidebarUsagePopover({
  anchor,
  children,
}: {
  anchor: DOMRect;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const height = el.offsetHeight;
    // Sits beside the row, bottom-aligned with it, and falls back to the other
    // side when the sidebar has been dragged wide enough to crowd the right.
    const top = Math.max(
      MARGIN,
      Math.min(anchor.bottom - height, window.innerHeight - height - MARGIN),
    );
    const right = anchor.right + GAP;
    const left =
      right + USAGE_POPOVER_WIDTH > window.innerWidth - MARGIN
        ? Math.max(MARGIN, anchor.left - USAGE_POPOVER_WIDTH - GAP)
        : right;
    setPos({ top, left });
  }, [anchor]);

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width: USAGE_POPOVER_WIDTH,
        visibility: pos ? "visible" : "hidden",
      }}
      className="tooltip-in pointer-events-none fixed z-[9999] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.12),0_12px_32px_rgba(0,0,0,0.32)]"
    >
      {children}
    </div>,
    document.body,
  );
}
