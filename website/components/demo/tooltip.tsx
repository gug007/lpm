"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Side = "top" | "bottom" | "right";

type Props = {
  content: ReactNode;
  children: ReactNode;
  side?: Side;
  delay?: number;
  // Hugs the child by default; pass "flex w-full" for a full-width trigger.
  triggerClassName?: string;
};

const GAP = 8;
const EDGE_MARGIN = 8;
const HOVER_QUERY = "(hover: hover)";

function subscribeHover(onChange: () => void) {
  const mq = window.matchMedia(HOVER_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

// Replaces native `title=` in the demo. Shortcut hints follow the app's middot
// convention and are formatted by the caller, e.g. content={"Close  ·  ⌘W"}.
export function Tooltip({
  content,
  children,
  side = "top",
  delay = 400,
  triggerClassName = "inline-flex",
}: Props) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const showTimer = useRef<number | null>(null);
  const showCount = useRef(0);
  const hoverCapable = useSyncExternalStore(
    subscribeHover,
    () => window.matchMedia(HOVER_QUERY).matches,
    () => true,
  );
  // Monotonic id of the current dwell, null while hidden. Tagging the measured
  // position with it means a reopened tooltip cannot paint at the stale spot.
  const [openId, setOpenId] = useState<number | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; id: number } | null>(
    null,
  );

  const clearShowTimer = useCallback(() => {
    if (showTimer.current !== null) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  }, []);

  const open = useCallback(() => {
    showCount.current += 1;
    setOpenId(showCount.current);
  }, []);

  const hide = useCallback(() => {
    clearShowTimer();
    setOpenId(null);
  }, [clearShowTimer]);

  const show = useCallback(() => {
    clearShowTimer();
    showTimer.current = window.setTimeout(() => {
      showTimer.current = null;
      open();
    }, delay);
  }, [clearShowTimer, delay, open]);

  // Drop a pending show if the trigger unmounts mid-dwell.
  useEffect(() => clearShowTimer, [clearShowTimer]);

  useEffect(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (openId === null || !trigger || !tooltip) return;

    const tr = trigger.getBoundingClientRect();
    const tt = tooltip.getBoundingClientRect();

    let top: number;
    let left: number;
    if (side === "right") {
      left = tr.right + GAP;
      top = tr.top + tr.height / 2 - tt.height / 2;
    } else {
      top = side === "top" ? tr.top - tt.height - GAP : tr.bottom + GAP;
      left = tr.left + tr.width / 2 - tt.width / 2;
    }

    const maxLeft = window.innerWidth - EDGE_MARGIN - tt.width;
    const maxTop = window.innerHeight - EDGE_MARGIN - tt.height;
    setPos({
      top: Math.max(EDGE_MARGIN, Math.min(top, maxTop)),
      left: Math.max(EDGE_MARGIN, Math.min(left, maxLeft)),
      id: openId,
    });
  }, [openId, side]);

  if (!hoverCapable || !content) return <>{children}</>;

  const placed = pos !== null && pos.id === openId;

  return (
    <>
      <span
        ref={triggerRef}
        className={triggerClassName}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={(e) => {
          if (e.target.matches(":focus-visible")) open();
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) hide();
        }}
      >
        {children}
      </span>
      {openId !== null &&
        createPortal(
          <span
            ref={tooltipRef}
            role="tooltip"
            // Rendered hidden for one pass so it can be measured before it is
            // placed, which keeps it from flashing at the top-left corner.
            style={{
              top: placed ? pos.top : 0,
              left: placed ? pos.left : 0,
              visibility: placed ? "visible" : "hidden",
            }}
            className="pointer-events-none fixed z-[9999] whitespace-nowrap rounded-lg border border-[#2e2e2e] bg-[#242424] px-3 py-1.5 text-[12px] text-[#e5e5e5] shadow-[0_1px_3px_rgba(0,0,0,0.12),0_12px_32px_rgba(0,0,0,0.22)]"
          >
            {content}
          </span>,
          document.body,
        )}
    </>
  );
}
