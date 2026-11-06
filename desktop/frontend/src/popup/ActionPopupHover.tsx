import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ActionInfo, ActionPopupInfo } from "../types";
import { useOverlay } from "../store/overlay";
import { ActionPopupCard } from "./ActionPopupCard";

const OPEN_DELAY_MS = 350;
const CLOSE_GRACE_MS = 150;
const GAP = 8;
const EDGE = 8;
// How far past the button and the card the pointer may stray before it closes.
const ZONE_PAD = 10;

// The one card open; opening another closes it, as only one page runs at once.
let closeOpenCard: (() => void) | null = null;

interface ActionPopupHoverProps {
  project: string;
  action: ActionInfo & { popup: ActionPopupInfo };
  children: ReactNode;
  triggerClassName?: string;
  extra?: ReactNode;
}

// An action's button with its popup card. The page inside the card is a
// webview of its own, which the app's pointer events never reach, so the card
// stays open while the pointer was last seen over the button or the card and
// closes once it's seen anywhere else, or on Escape, a click outside, or a
// scroll that moves the button.
export function ActionPopupHover({
  project,
  action,
  children,
  triggerClassName = "inline-flex",
  extra,
}: ActionPopupHoverProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // An in-pane browser's webview would otherwise sit over the card.
  useOverlay(open);

  const clearTimers = useCallback(() => {
    if (showTimer.current !== null) window.clearTimeout(showTimer.current);
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    showTimer.current = null;
    hideTimer.current = null;
  }, []);

  const close = useCallback(() => {
    clearTimers();
    setOpen(false);
  }, [clearTimers]);

  const menuOpen = () => !!triggerRef.current?.querySelector('[aria-expanded="true"]');

  const show = () => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (open || showTimer.current !== null || menuOpen()) return;
    showTimer.current = window.setTimeout(() => {
      showTimer.current = null;
      if (menuOpen()) return;
      closeOpenCard?.();
      closeOpenCard = close;
      setOpen(true);
    }, OPEN_DELAY_MS);
  };

  const leaveTrigger = () => {
    if (open || showTimer.current === null) return;
    window.clearTimeout(showTimer.current);
    showTimer.current = null;
  };

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const card = cardRef.current;
    if (!open || !trigger || !card) {
      setPos(null);
      return;
    }
    const t = trigger.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const roomBelow = window.innerHeight - EDGE - (t.bottom + GAP);
    const below = c.height <= roomBelow || t.top - GAP - EDGE < roomBelow;
    const top = below ? t.bottom + GAP : t.top - GAP - c.height;
    const left = Math.min(Math.max(EDGE, t.left), window.innerWidth - EDGE - c.width);
    setPos({
      top: Math.min(Math.max(EDGE, top), window.innerHeight - EDGE - c.height),
      left: Math.max(EDGE, left),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const inZone = (x: number, y: number) => {
      const t = trigger?.getBoundingClientRect();
      if (!t) return false;
      const c = cardRef.current?.getBoundingClientRect() ?? t;
      return (
        x >= Math.min(t.left, c.left) - ZONE_PAD &&
        x <= Math.max(t.right, c.right) + ZONE_PAD &&
        y >= Math.min(t.top, c.top) - ZONE_PAD &&
        y <= Math.max(t.bottom, c.bottom) + ZONE_PAD
      );
    };
    const onMove = (e: MouseEvent) => {
      if (inZone(e.clientX, e.clientY)) {
        if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      } else if (hideTimer.current === null) {
        hideTimer.current = window.setTimeout(close, CLOSE_GRACE_MS);
      }
    };
    const outside = (e: Event) => !cardRef.current?.contains(e.target as Node);
    const onDown = (e: MouseEvent) => outside(e) && close();
    // Only a scroll that carries the button away closes it: a terminal
    // printing output scrolls all the time.
    const anchor = trigger?.getBoundingClientRect();
    const moved = () => {
      const now = trigger?.getBoundingClientRect();
      return !anchor || !now || now.top !== anchor.top || now.left !== anchor.left;
    };
    const onScroll = (e: Event) => outside(e) && moved() && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    // A button's own menu opening under the card closes it.
    const observer = new MutationObserver(() => menuOpen() && close());
    if (trigger) {
      observer.observe(trigger, { attributes: true, attributeFilter: ["aria-expanded"], subtree: true });
    }
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      observer.disconnect();
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
      if (closeOpenCard === close) closeOpenCard = null;
    };
  }, [open, close]);

  useEffect(() => clearTimers, [clearTimers]);

  return (
    <>
      <span
        ref={triggerRef}
        className={triggerClassName}
        onMouseEnter={show}
        onMouseLeave={leaveTrigger}
        onContextMenu={close}
      >
        {children}
      </span>
      {open &&
        createPortal(
          <div
            ref={cardRef}
            role="dialog"
            aria-label={action.popup.title || action.label}
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              visibility: pos ? "visible" : "hidden",
            }}
            className="fixed z-[9999] rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-[var(--text-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.12),0_12px_32px_rgba(0,0,0,0.22)]"
          >
            <ActionPopupCard project={project} action={action} open={pos !== null} extra={extra} />
          </div>,
          document.body,
        )}
    </>
  );
}
