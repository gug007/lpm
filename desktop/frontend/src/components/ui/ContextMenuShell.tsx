import { useLayoutEffect, useState, type ReactNode } from "react";
import { useEventListener } from "../../hooks/useEventListener";
import { useOutsideClick } from "../../hooks/useOutsideClick";

interface ContextMenuShellProps {
  x: number;
  y: number;
  minWidth?: number;
  onClose: () => void;
  children: ReactNode;
}

const VIEWPORT_MARGIN = 8;

export function ContextMenuShell({ x, y, minWidth = 160, onClose, children }: ContextMenuShellProps) {
  const ref = useOutsideClick<HTMLDivElement>(onClose);
  useEventListener("keydown", (e) => {
    if (e.key === "Escape") onClose();
  }, document);

  // Shift the menu up/left when the click lands too close to the bottom or
  // right edge — without this, footer-action menus render off-screen.
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(VIEWPORT_MARGIN, Math.min(x, window.innerWidth - width - VIEWPORT_MARGIN));
    const top = Math.max(VIEWPORT_MARGIN, Math.min(y, window.innerHeight - height - VIEWPORT_MARGIN));
    setPos((prev) => (prev.left === left && prev.top === top ? prev : { left, top }));
  }, [x, y]);

  return (
    <div
      ref={ref}
      className="fixed z-50 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg"
      style={{ left: pos.left, top: pos.top, minWidth }}
    >
      {children}
    </div>
  );
}
