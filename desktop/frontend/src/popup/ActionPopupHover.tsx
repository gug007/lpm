import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { ActionInfo, ActionPopupInfo } from "../types";
import { useEventListener } from "../hooks/useEventListener";
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

function cancel(timer: RefObject<number | null>) {
  if (timer.current !== null) window.clearTimeout(timer.current);
  timer.current = null;
}

interface ActionPopupHoverProps {
  project: string;
  action: ActionInfo;
  popup: ActionPopupInfo;
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
  popup,
  children,
  triggerClassName = "inline-flex",
  extra,
}: ActionPopupHoverProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<DOMRect | null>(null);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // An in-pane browser's webview would otherwise sit over the card.
  useOverlay(open);

  const clearTimers = useCallback(() => {
    cancel(showTimer);
    cancel(hideTimer);
  }, []);

  const close = useCallback(() => {
    clearTimers();
    setOpen(false);
  }, [clearTimers]);

  const menuOpen = () => !!triggerRef.current?.querySelector('[aria-expanded="true"]');

  const show = () => {
    cancel(hideTimer);
    if (open || showTimer.current !== null || menuOpen()) return;
    showTimer.current = window.setTimeout(() => {
      showTimer.current = null;
      if (menuOpen()) return;
      closeOpenCard?.();
      closeOpenCard = close;
      setOpen(true);
    }, OPEN_DELAY_MS);
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

  const inZone = (x: number, y: number) => {
    const t = triggerRef.current?.getBoundingClientRect();
    if (!t) return false;
    const c = cardRef.current?.getBoundingClientRect() ?? t;
    return (
      x >= Math.min(t.left, c.left) - ZONE_PAD &&
      x <= Math.max(t.right, c.right) + ZONE_PAD &&
      y >= Math.min(t.top, c.top) - ZONE_PAD &&
      y <= Math.max(t.bottom, c.bottom) + ZONE_PAD
    );
  };
  const outside = (e: Event) => !cardRef.current?.contains(e.target as Node);
  const moved = () => {
    const now = triggerRef.current?.getBoundingClientRect();
    return !anchor.current || !now || now.top !== anchor.current.top || now.left !== anchor.current.left;
  };

  useEventListener(
    "mousemove",
    (e) => {
      if (inZone(e.clientX, e.clientY)) cancel(hideTimer);
      else if (hideTimer.current === null) hideTimer.current = window.setTimeout(close, CLOSE_GRACE_MS);
    },
    document,
    open,
    true,
  );
  useEventListener("mousedown", (e) => outside(e) && close(), document, open, true);
  // Left to reach the terminal too: the pointer resting here doesn't take the key.
  useEventListener("keydown", (e) => e.key === "Escape" && close(), document, open, true);
  // Only a scroll that carries the button away closes it: a terminal printing
  // output scrolls all the time.
  useEventListener("scroll", (e) => outside(e) && moved() && close(), window, open, true);
  useEventListener("resize", close, window, open);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    anchor.current = trigger?.getBoundingClientRect() ?? null;
    // A button's own menu opening under the card closes it.
    const observer = new MutationObserver(() => menuOpen() && close());
    if (trigger) {
      observer.observe(trigger, { attributes: true, attributeFilter: ["aria-expanded"], subtree: true });
    }
    return () => {
      observer.disconnect();
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
        onMouseLeave={() => cancel(showTimer)}
        onContextMenu={close}
      >
        {children}
      </span>
      {open &&
        createPortal(
          <div
            ref={cardRef}
            role="dialog"
            aria-label={popup.title || action.label}
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              visibility: pos ? "visible" : "hidden",
            }}
            className="fixed z-[9999] rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-[var(--text-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.12),0_12px_32px_rgba(0,0,0,0.22)]"
          >
            <ActionPopupCard project={project} action={action} popup={popup} open={pos !== null} extra={extra} />
          </div>,
          document.body,
        )}
    </>
  );
}
