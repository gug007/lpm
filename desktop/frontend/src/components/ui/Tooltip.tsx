import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
}

export function Tooltip({ content, children, side = "top", align = "center" }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; arrowLeft: number }>({ top: 0, left: 0, arrowLeft: 0 });

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const tr = trigger.getBoundingClientRect();
    const tt = tooltip.getBoundingClientRect();
    const gap = 6;

    let top = side === "top" ? tr.top - tt.height - gap : tr.bottom + gap;
    let left =
      align === "start" ? tr.left
      : align === "end" ? tr.right - tt.width
      : tr.left + tr.width / 2 - tt.width / 2;

    // Clamp to viewport
    if (left < 4) left = 4;
    if (left + tt.width > window.innerWidth - 4) left = window.innerWidth - 4 - tt.width;

    const triggerCenter = tr.left + tr.width / 2;
    const arrowLeft = Math.min(Math.max(triggerCenter - left, 8), tt.width - 8);

    setPos({ top, left, arrowLeft });
  }, [side, align]);

  useEffect(() => {
    if (visible) updatePosition();
  }, [visible, updatePosition]);

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex"
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
          className="pointer-events-none fixed z-[9999] whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 font-mono text-[10px] font-medium text-[var(--text-primary)] shadow-lg transition-opacity duration-100"
        >
          {content}
          <span
            aria-hidden
            style={{ left: pos.arrowLeft }}
            className={`absolute h-2 w-2 -translate-x-1/2 rotate-45 border-[var(--border)] bg-[var(--bg-primary)] ${
              side === "top"
                ? "bottom-0 translate-y-1/2 border-b border-r"
                : "top-0 -translate-y-1/2 border-l border-t"
            }`}
          />
        </span>,
        document.body,
      )}
    </>
  );
}
