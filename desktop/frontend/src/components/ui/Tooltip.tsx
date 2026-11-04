import { useState, useRef, useCallback, useEffect, useLayoutEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Side = "top" | "bottom" | "right" | "left";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: Side;
  align?: "start" | "center" | "end";
  wide?: boolean;
  // A wide card's limit, for one that needs more than the default 340px.
  maxWidth?: number;
  // Wrap long content instead of keeping one nowrap line, clamped to this many
  // lines (overflow ellipsized).
  maxLines?: number;
  // Hover dwell before the tooltip appears, in ms. Default 0 shows it immediately.
  delay?: number;
  // Default "inline-flex" hugs the child; pass "flex w-full" for full-width triggers.
  triggerClassName?: string;
  // Keeps the tooltip down, e.g. while the trigger's own menu is open under it.
  disabled?: boolean;
  // A card with its own buttons: it takes the pointer, and stays up while the
  // pointer moves from the trigger onto it.
  interactive?: boolean;
}

const GAP = 8;
const EDGE_MARGIN = 8;
// How long an interactive card waits for the pointer to cross the gap to it.
const LEAVE_GRACE_MS = 200;

export function Tooltip({ content, children, side = "top", align = "center", wide = false, maxWidth, maxLines, delay = 0, triggerClassName = "inline-flex", disabled = false, interactive = false }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // A trigger whose own popover or menu is open (aria-expanded) keeps its
  // tooltip down, so the tooltip can't cover what the click just opened.
  const [expanded, setExpanded] = useState(false);
  const suppressed = disabled || expanded;

  useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const read = () => setExpanded(trigger.querySelector('[aria-expanded="true"]') !== null);
    read();
    const observer = new MutationObserver(read);
    observer.observe(trigger, { attributes: true, attributeFilter: ["aria-expanded"], subtree: true });
    return () => observer.disconnect();
  }, []);

  const clearShowTimer = useCallback(() => {
    if (showTimer.current !== null) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  // Reveal after the dwell delay (or immediately when delay is 0); leaving the
  // trigger before it elapses cancels the pending show.
  const show = useCallback(() => {
    clearHideTimer();
    if (suppressed) return;
    if (delay <= 0) {
      setVisible(true);
      return;
    }
    clearShowTimer();
    showTimer.current = window.setTimeout(() => {
      showTimer.current = null;
      setVisible(true);
    }, delay);
  }, [delay, clearShowTimer, clearHideTimer, suppressed]);

  const hide = useCallback(() => {
    clearShowTimer();
    clearHideTimer();
    setVisible(false);
  }, [clearShowTimer, clearHideTimer]);

  // Leaving the trigger (or an interactive card) hides it, after a moment for
  // an interactive card so the pointer can reach it.
  const leave = useCallback(() => {
    if (!interactive) return hide();
    clearShowTimer();
    clearHideTimer();
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null;
      setVisible(false);
    }, LEAVE_GRACE_MS);
  }, [interactive, hide, clearShowTimer, clearHideTimer]);

  // Drop pending timers if the trigger unmounts.
  useEffect(() => () => {
    clearShowTimer();
    clearHideTimer();
  }, [clearShowTimer, clearHideTimer]);

  useEffect(() => {
    if (suppressed) hide();
  }, [suppressed, hide]);

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
        onMouseLeave={leave}
        // A right-click opens a context menu without moving the pointer off the
        // trigger, so the hover tooltip would otherwise stay up behind the menu.
        onContextMenu={hide}
        // Immediate (no dwell) on keyboard focus; :focus-visible keeps mouse
        // clicks from pinning the tooltip until blur.
        onFocus={(e) => {
          if (!suppressed && e.target.matches(":focus-visible")) setVisible(true);
        }}
        onBlur={(e) => {
          // Pressing a button on an interactive card moves focus off the trigger.
          if (interactive && tooltipRef.current?.matches(":hover")) return;
          if (!e.currentTarget.contains(e.relatedTarget)) hide();
        }}
      >
        {children}
      </span>
      {visible && createPortal(
        <span
          ref={tooltipRef}
          role={interactive ? undefined : "tooltip"}
          onMouseEnter={interactive ? clearHideTimer : undefined}
          onMouseLeave={interactive ? leave : undefined}
          style={{
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            visibility: pos ? "visible" : "hidden",
            ...(maxWidth ? { maxWidth } : {}),
            ...(maxLines && !wide
              ? {
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical" as const,
                  WebkitLineClamp: maxLines,
                  overflow: "hidden",
                }
              : {}),
          }}
          className={`tooltip-in ${interactive ? "pointer-events-auto" : "pointer-events-none"} fixed z-[9999] border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.12),0_12px_32px_rgba(0,0,0,0.22)] ${
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
