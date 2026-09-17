import { useLayoutEffect, useState, type ReactNode } from "react";
import { useEventListener } from "../../hooks/useEventListener";
import { useOutsideClick } from "../../hooks/useOutsideClick";
import { SubmenuCoordinator } from "./submenuCoordinator";

interface ContextMenuShellProps {
  x: number;
  y: number;
  // Which edge of the menu sits at `x`: its left (default) or its right, for a
  // menu hanging from a control at the right of its container.
  align?: "start" | "end";
  minWidth?: number;
  onClose: () => void;
  children: ReactNode;
}

const VIEWPORT_MARGIN = 8;

export const MENU_PANEL_CLASS =
  "menu-pop rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg";

export function ContextMenuShell({
  x,
  y,
  align = "start",
  minWidth = 160,
  onClose,
  children,
}: ContextMenuShellProps) {
  const ref = useOutsideClick<HTMLDivElement>(onClose);
  useEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
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
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const anchored = align === "end" ? x - width : x;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(anchored, window.innerWidth - width - VIEWPORT_MARGIN));
    const top = Math.max(VIEWPORT_MARGIN, Math.min(y, window.innerHeight - height - VIEWPORT_MARGIN));
    setPos((prev) => (prev.left === left && prev.top === top ? prev : { left, top }));
  }, [x, y, align]);

  return (
    <div
      ref={ref}
      className={`fixed z-[80] ${MENU_PANEL_CLASS}`}
      style={{ left: pos.left, top: pos.top, minWidth }}
    >
      <SubmenuCoordinator>{children}</SubmenuCoordinator>
    </div>
  );
}
