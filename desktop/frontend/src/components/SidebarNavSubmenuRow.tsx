import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useEventListener } from "../hooks/useEventListener";
import { SidebarNavRow, type RowMenuAnchor, type SidebarNavEntry } from "./SidebarNavRow";
import { MENU_PANEL_CLASS } from "./ui/ContextMenuShell";
import { SUBMENU_VIEWPORT_MARGIN, useSubmenuPlacement } from "./ui/useSubmenuPlacement";

// A diagonal path from the row to the panel briefly crosses the rows below it.
const CLOSE_DELAY = 150;
// Clears the More menu's padding and border, so the panel opens beside the menu
// rather than over its edge.
const MENU_GAP = "0.5rem";

interface SidebarNavSubmenuRowProps {
  entry: SidebarNavEntry;
  panel: ReactNode;
  // The menu the row sits in: resting on any other part of it closes the panel.
  menu: RefObject<HTMLElement | null>;
  menuOpen: boolean;
  onOpenMenu: (anchor: RowMenuAnchor) => void;
}

// A More menu row whose popup opens beside it on hover, the way a native
// submenu does. Like one, it stays open when the pointer leaves the menus
// altogether — so a field or a select in the panel survives the pointer
// drifting off it — and closes once the pointer rests on another row.
export function SidebarNavSubmenuRow({ entry, panel, menu, menuOpen, onOpenMenu }: SidebarNavSubmenuRowProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  // The row's options menu takes the panel's place beside it.
  const shown = open && !menuOpen;
  const placement = useSubmenuPlacement(wrapperRef, panelRef, shown);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const openNow = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
    setOpen(true);
  };

  useEventListener(
    "mouseover",
    (e) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target) || !menu.current?.contains(target)) return;
      if (closeTimer.current !== undefined) return;
      closeTimer.current = window.setTimeout(() => {
        closeTimer.current = undefined;
        setOpen(false);
      }, CLOSE_DELAY);
    },
    document,
    open,
  );

  return (
    <div ref={wrapperRef} className="relative" onMouseEnter={openNow}>
      <SidebarNavRow
        entry={{ ...entry, active: entry.active || shown, description: undefined, onSelect: openNow }}
        menuOpen={menuOpen}
        onOpenMenu={onOpenMenu}
        inMenu
      />
      {shown && (
        <div
          ref={panelRef}
          className={`absolute z-50 overflow-y-auto ${MENU_PANEL_CLASS}`}
          style={{
            top: placement.shiftY,
            maxHeight: `calc(100vh - ${2 * SUBMENU_VIEWPORT_MARGIN}px)`,
            [placement.side === "right" ? "left" : "right"]: `calc(100% + ${MENU_GAP})`,
          }}
        >
          {panel}
        </div>
      )}
    </div>
  );
}
