import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRightIcon } from "../icons";
import { ContextMenuItem } from "./ContextMenuItem";
import { MENU_PANEL_CLASS } from "./ContextMenuShell";
import { SubmenuCoordinator, useSubmenuDisclosure } from "./submenuCoordinator";

interface ContextMenuSubmenuProps {
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  // When set, clicking the row runs this instead of opening the submenu (the
  // submenu still opens on hover) — e.g. "Open with" launches the default app.
  onActivate?: () => void;
  children: ReactNode;
}

const VIEWPORT_MARGIN = 8;
// Cancels the panel's py-1 so its first row aligns with the parent row.
const PANEL_PADDING_OFFSET = -4;

// The panel is a child of the row wrapper: one mouseleave governs both
// and their adjacent edges leave no hover gap.
export function ContextMenuSubmenu({ label, icon, disabled, onActivate, children }: ContextMenuSubmenuProps) {
  const { open, openNow, scheduleClose } = useSubmenuDisclosure(disabled);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState({ side: "right" as "right" | "left", shiftY: PANEL_PADDING_OFFSET });

  // Position the panel beside its row, flipping to the left and shifting up
  // when it would otherwise spill past the viewport edges. The panel never
  // climbs above the top margin; if it is taller than the viewport its own
  // max-height + scroll keeps every row reachable.
  const reposition = useCallback(() => {
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
    const top = Math.max(VIEWPORT_MARGIN, Math.min(desiredTop, maxTop));
    const shiftY = top - w.top;
    setPlacement((prev) =>
      prev.side === side && prev.shiftY === shiftY ? prev : { side, shiftY },
    );
  }, []);

  // Re-measure whenever the open panel changes size — its content can load
  // asynchronously (e.g. the Git submenu), growing the panel after the first
  // measurement and pushing rows off-screen if we positioned it only once.
  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const panel = panelRef.current;
    if (!panel) return;
    const ro = new ResizeObserver(() => reposition());
    ro.observe(panel);
    return () => ro.disconnect();
  }, [open, reposition]);

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={openNow}
      onMouseLeave={scheduleClose}
    >
      <ContextMenuItem
        label={label}
        icon={icon}
        trailing={<ChevronRightIcon />}
        disabled={disabled}
        onClick={onActivate ?? openNow}
      />
      {open && (
        <div
          ref={panelRef}
          className={`absolute z-50 min-w-[120px] overflow-y-auto ${MENU_PANEL_CLASS}`}
          style={{
            top: placement.shiftY,
            maxHeight: `calc(100vh - ${2 * VIEWPORT_MARGIN}px)`,
            ...(placement.side === "right" ? { left: "100%" } : { right: "100%" }),
          }}
        >
          <SubmenuCoordinator>{children}</SubmenuCoordinator>
        </div>
      )}
    </div>
  );
}
