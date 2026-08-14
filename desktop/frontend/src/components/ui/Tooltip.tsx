import { useState, useRef, useCallback, useEffect, useLayoutEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Side = "top" | "bottom" | "right" | "left";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: Side;
  align?: "start" | "center" | "end";
  wide?: boolean;
  // Wrap long content instead of keeping one nowrap line, clamped to this many
  // lines (overflow ellipsized).
  maxLines?: number;
  // Hover dwell before the tooltip appears, in ms. Default 0 shows it immediately.
  delay?: number;
  // Default "inline-flex" hugs the child; pass "flex w-full" for full-width triggers.
  triggerClassName?: string;
}

const GAP = 8;
const EDGE_MARGIN = 8;

export function Tooltip({ content, children, side = "top", align = "center", wide = false, maxLines, delay = 0, triggerClassName = "inline-flex" }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const showTimer = useRef<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const clearShowTimer = useCallback(() => {
    if (showTimer.current !== null) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  }, []);

  // Reveal after the dwell delay (or immediately when delay is 0); leaving the
  // trigger before it elapses cancels the pending show.
  const show = useCallback(() => {
    if (delay <= 0) {
      setVisible(true);
      return;
    }
    clearShowTimer();
    showTimer.current = window.setTimeout(() => {
      showTimer.current = null;
      setVisible(true);
    }, delay);
  }, [delay, clearShowTimer]);

  const hide = useCallback(() => {
    clearShowTimer();
    setVisible(false);
  }, [clearShowTimer]);

  // Drop a pending show if the trigger unmounts mid-dwell.
  useEffect(() => clearShowTimer, [clearShowTimer]);

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

  useLayoutEffect(() => {
    if (visible) updatePosition();
    else setPos(null);
  }, [visible, updatePosition]);

  return (
    <>
      <span
        ref={triggerRef}
        className={triggerClassName}
        onMouseEnter={show}
        onMouseLeave={hide}
        // Immediate (no dwell) on keyboard focus; :focus-visible keeps mouse
        // clicks from pinning the tooltip until blur.
        onFocus={(e) => {
          if (e.target.matches(":focus-visible")) setVisible(true);
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) hide();
        }}
      >
        {children}
      </span>
      {visible && createPortal(
        <span
          ref={tooltipRef}
          role="tooltip"
          style={{
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            visibility: pos ? "visible" : "hidden",
            ...(maxLines && !wide
              ? {
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical" as const,
                  WebkitLineClamp: maxLines,
                  overflow: "hidden",
                }
              : {}),
          }}
          className={`tooltip-in pointer-events-none fixed z-[9999] border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.12),0_12px_32px_rgba(0,0,0,0.22)] ${
            wide
              ? "max-w-[340px] whitespace-normal rounded-xl px-3.5 py-3 text-[12px] leading-relaxed"
              : maxLines
                ? "max-w-[260px] whitespace-normal break-words rounded-lg px-3 py-1.5 text-[12px] leading-snug"
                : "whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px]"
          }`}
        >
          {content}
        </span>,
        document.body,
      )}
    </>
  );
}
