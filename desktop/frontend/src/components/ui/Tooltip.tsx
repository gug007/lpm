import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Side = "top" | "bottom" | "right" | "left";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: Side;
  align?: "start" | "center" | "end";
  wide?: boolean;
  // Default "inline-flex" hugs the child; pass "flex w-full" for full-width triggers.
  triggerClassName?: string;
}

const GAP = 8;
const EDGE_MARGIN = 8;

export function Tooltip({ content, children, side = "top", align = "center", wide = false, triggerClassName = "inline-flex" }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const tr = trigger.getBoundingClientRect();
    const tt = tooltip.getBoundingClientRect();

    let top: number;
    let left: number;

    if (side === "right" || side === "left") {
      left = side === "right" ? tr.right + GAP : tr.left - tt.width - GAP;
      top =
        align === "start" ? tr.top
        : align === "end" ? tr.bottom - tt.height
        : tr.top + tr.height / 2 - tt.height / 2;
    } else {
      top = side === "top" ? tr.top - tt.height - GAP : tr.bottom + GAP;
      left =
        align === "start" ? tr.left
        : align === "end" ? tr.right - tt.width
        : tr.left + tr.width / 2 - tt.width / 2;
    }

    if (left < EDGE_MARGIN) left = EDGE_MARGIN;
    if (left + tt.width > window.innerWidth - EDGE_MARGIN) left = window.innerWidth - EDGE_MARGIN - tt.width;
    if (top < EDGE_MARGIN) top = EDGE_MARGIN;
    if (top + tt.height > window.innerHeight - EDGE_MARGIN) top = window.innerHeight - EDGE_MARGIN - tt.height;

    setPos({ top, left });
  }, [side, align]);

  useEffect(() => {
    if (visible) updatePosition();
  }, [visible, updatePosition]);

  return (
    <>
      <span
        ref={triggerRef}
        className={triggerClassName}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
      >
        {children}
      </span>
      {visible && createPortal(
        <span
          ref={tooltipRef}
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
          className={`pointer-events-none fixed z-[9999] rounded-lg bg-[var(--bg-secondary)] px-3 py-1.5 text-[var(--text-primary)] shadow-[0_8px_24px_rgba(0,0,0,0.22)] ${
            wide
              ? "max-w-[260px] whitespace-normal text-[12px] leading-relaxed"
              : "whitespace-nowrap text-[12px]"
          }`}
        >
          {content}
        </span>,
        document.body,
      )}
    </>
  );
}
