import { useRef, type ReactNode } from "react";
import { ChevronRightIcon } from "../icons";
import { ContextMenuItem } from "./ContextMenuItem";
import { MENU_PANEL_CLASS } from "./ContextMenuShell";
import { SubmenuCoordinator, useSubmenuDisclosure } from "./submenuCoordinator";
import { SUBMENU_VIEWPORT_MARGIN, useSubmenuPlacement } from "./useSubmenuPlacement";

interface ContextMenuSubmenuProps {
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  // When set, clicking the row runs this instead of opening the submenu (the
  // submenu still opens on hover) — e.g. "Open with" launches the default app.
  onActivate?: () => void;
  children: ReactNode;
}

// The panel is a child of the row wrapper: one mouseleave governs both
// and their adjacent edges leave no hover gap.
export function ContextMenuSubmenu({ label, icon, disabled, onActivate, children }: ContextMenuSubmenuProps) {
  const { open, openNow, scheduleClose } = useSubmenuDisclosure(disabled);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const placement = useSubmenuPlacement(wrapperRef, panelRef, open);

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
            maxHeight: `calc(100vh - ${2 * SUBMENU_VIEWPORT_MARGIN}px)`,
            ...(placement.side === "right" ? { left: "100%" } : { right: "100%" }),
          }}
        >
          <SubmenuCoordinator>{children}</SubmenuCoordinator>
        </div>
      )}
    </div>
  );
}
