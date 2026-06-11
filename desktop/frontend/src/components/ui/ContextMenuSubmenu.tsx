import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRightIcon } from "../icons";
import { ContextMenuItem } from "./ContextMenuItem";
import { MENU_PANEL_CLASS } from "./ContextMenuShell";

interface ContextMenuSubmenuProps {
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  children: ReactNode;
}

const VIEWPORT_MARGIN = 8;
// Cancels the panel's py-1 so its first row aligns with the parent row.
const PANEL_PADDING_OFFSET = -4;

// The panel is a child of the row wrapper: one mouseleave governs both
// and their adjacent edges leave no hover gap.
export function ContextMenuSubmenu({ label, icon, disabled, children }: ContextMenuSubmenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const [placement, setPlacement] = useState({ side: "right" as "right" | "left", shiftY: PANEL_PADDING_OFFSET });

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useLayoutEffect(() => {
    if (!open) return;
    const wrapper = wrapperRef.current;
    const panel = panelRef.current;
    if (!wrapper || !panel) return;
    const w = wrapper.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const overflowsRight = w.right + p.width > window.innerWidth - VIEWPORT_MARGIN;
    const fitsLeft = w.left - p.width >= VIEWPORT_MARGIN;
    const side = overflowsRight && fitsLeft ? "left" : "right";
    const desiredTop = w.top + PANEL_PADDING_OFFSET;
    const maxTop = window.innerHeight - VIEWPORT_MARGIN - p.height;
    const shiftY = Math.min(desiredTop, maxTop) - w.top;
    setPlacement((prev) =>
      prev.side === side && prev.shiftY === shiftY ? prev : { side, shiftY },
    );
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={() => {
        window.clearTimeout(closeTimer.current);
        if (!disabled) setOpen(true);
      }}
      onMouseLeave={() => {
        // A diagonal path to a far panel item briefly crosses sibling
        // rows; closing instantly would kill the submenu mid-gesture.
        closeTimer.current = window.setTimeout(() => setOpen(false), 150);
      }}
    >
      <ContextMenuItem
        label={label}
        icon={icon}
        trailing={<ChevronRightIcon />}
        disabled={disabled}
        onClick={() => setOpen(true)}
      />
      {open && (
        <div
          ref={panelRef}
          className={`absolute z-50 min-w-[120px] ${MENU_PANEL_CLASS}`}
          style={{
            top: placement.shiftY,
            ...(placement.side === "right" ? { left: "100%" } : { right: "100%" }),
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
