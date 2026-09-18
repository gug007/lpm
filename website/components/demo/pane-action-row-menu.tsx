"use client";

import { MoreHorizontal, PanelTop, Undo2 } from "lucide-react";
import { MenuButton, MenuSeparator } from "./menu-button";
import { MENU_PANEL_CLASS, MenuLayer } from "./menu-layer";

const ICON_CLASS = "h-3.5 w-3.5";

// Right-click on a pane action, wherever it lives: send it across, or put the
// whole header back the way it ships.
export function PaneActionRowMenu({
  x,
  y,
  label,
  onToolbar,
  isDefault,
  onMove,
  onReset,
  onClose,
}: {
  x: number;
  y: number;
  label: string;
  onToolbar: boolean;
  isDefault: boolean;
  onMove: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <MenuLayer onClose={onClose}>
      <div
        role="menu"
        style={{ left: x, top: y, minWidth: 190 }}
        className={MENU_PANEL_CLASS}
      >
        <MenuButton
          icon={
            onToolbar ? (
              <MoreHorizontal className={ICON_CLASS} />
            ) : (
              <PanelTop className={ICON_CLASS} />
            )
          }
          label={onToolbar ? "Show in the menu instead" : "Show as a button"}
          title={
            onToolbar
              ? `Put ${label} back in the menu`
              : `Give ${label} its own button in the header`
          }
          onClick={() => {
            onClose();
            onMove();
          }}
        />
        <MenuSeparator />
        <MenuButton
          icon={<Undo2 className={ICON_CLASS} />}
          label="Reset to default"
          disabled={isDefault}
          title={
            isDefault
              ? "The header is already laid out the way it ships"
              : "Put every action back where it started"
          }
          onClick={() => {
            onClose();
            onReset();
          }}
        />
      </div>
    </MenuLayer>
  );
}
