import { useLayoutEffect, useState, type ReactNode } from "react";
import { useEventListener } from "../../hooks/useEventListener";
import { useOutsideClick } from "../../hooks/useOutsideClick";
import { SubmenuCoordinator } from "./submenuCoordinator";

type ContextMenuShellProps = {
  // Which edge of the menu sits at `x` (or at the anchor's edge): its left
  // (default) or its right, for a menu hanging from a control at the right of
  // its container.
  align?: "start" | "end";
  // Which side of the anchor the menu opens on: below it (default), or above,
  // for a control at the bottom of the window.
  side?: "bottom" | "top";
  minWidth?: number;
  // The control that opened the menu (the anchor, unless given). Pressing it is
  // not an outside click, so its own click can close the menu again.
  trigger?: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
} & (
  | { x: number; y: number; anchor?: undefined }
  // A menu hanging from a control: it opens under it, moves with it as the
  // page scrolls and closes once it scrolls out of view.
  | { anchor: HTMLElement; x?: undefined; y?: undefined }
);

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 4;

function scrolledOutOfView(anchor: HTMLElement, scroller: Element | null): boolean {
  const box = scroller?.getBoundingClientRect() ?? {
    top: 0,
    left: 0,
    bottom: window.innerHeight,
    right: window.innerWidth,
  };
  const r = anchor.getBoundingClientRect();
  return r.bottom <= box.top || r.top >= box.bottom || r.right <= box.left || r.left >= box.right;
}

export const MENU_PANEL_CLASS =
  "menu-pop rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg";

export function ContextMenuShell({
  x,
  y,
  align = "start",
  side = "bottom",
  anchor,
  minWidth = 160,
  trigger,
  onClose,
  children,
}: ContextMenuShellProps) {
  const ref = useOutsideClick<HTMLDivElement>((e) => {
    if (!(trigger ?? anchor)?.contains(e.target as Node)) onClose();
  });
  useEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      // Marks the key as spent, so a page that also leaves on Escape stays put.
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    // A field in the menu keeps its own arrow keys.
    if ((e.target as Element | null)?.closest?.("input, select, textarea, [contenteditable]")) return;
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled):not([data-menu-aux])") ?? [],
    );
    if (items.length === 0) return;
    e.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const delta = e.key === "ArrowDown" ? 1 : -1;
    const next =
      index === -1
        ? delta === 1
          ? 0
          : items.length - 1
        : (index + delta + items.length) % items.length;
    items[next].focus();
  }, document);

  // Shift the menu up/left when the click lands too close to the bottom or
  // right edge — without this, footer-action menus render off-screen.
  const [pos, setPos] = useState({ left: x ?? 0, top: y ?? 0 });
  const place = () => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    let px: number, py: number;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      px = align === "end" ? r.right : r.left;
      py = side === "top" ? r.top - ANCHOR_GAP - height : r.bottom + ANCHOR_GAP;
    } else {
      px = x;
      py = y;
    }
    const anchored = align === "end" ? px - width : px;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(anchored, window.innerWidth - width - VIEWPORT_MARGIN));
    const top = Math.max(VIEWPORT_MARGIN, Math.min(py, window.innerHeight - height - VIEWPORT_MARGIN));
    setPos((prev) => (prev.left === left && prev.top === top ? prev : { left, top }));
  };
  useLayoutEffect(place, [x, y, align, side, anchor]);

  // Capture-phase: scrolls inside a container don't bubble to the window.
  useEventListener(
    "scroll",
    (event) => {
      if (!anchor) return;
      const scroller = event.target instanceof Element ? event.target : null;
      if (scroller && !scroller.contains(anchor)) return;
      if (scrolledOutOfView(anchor, scroller)) onClose();
      else place();
    },
    window,
    !!anchor,
    true,
  );
  useEventListener("resize", place, window, !!anchor);

  return (
    <div
      ref={ref}
      data-context-menu=""
      className={`fixed z-[80] ${MENU_PANEL_CLASS}`}
      style={{ left: pos.left, top: pos.top, minWidth }}
    >
      <SubmenuCoordinator>{children}</SubmenuCoordinator>
    </div>
  );
}
