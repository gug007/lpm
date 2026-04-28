import { type ReactNode } from "react";
import { useEventListener } from "../../hooks/useEventListener";
import { useOutsideClick } from "../../hooks/useOutsideClick";

interface ContextMenuShellProps {
  x: number;
  y: number;
  minWidth?: number;
  onClose: () => void;
  children: ReactNode;
}

export function ContextMenuShell({ x, y, minWidth = 160, onClose, children }: ContextMenuShellProps) {
  const ref = useOutsideClick<HTMLDivElement>(onClose);
  useEventListener("keydown", (e) => {
    if (e.key === "Escape") onClose();
  }, document);

  return (
    <div
      ref={ref}
      className="fixed z-50 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg"
      style={{ left: x, top: y, minWidth }}
    >
      {children}
    </div>
  );
}
