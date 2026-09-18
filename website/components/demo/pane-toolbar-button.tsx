"use client";

import { useState } from "react";
import { IconBtn } from "./icon-btn";
import { PANE_ACTION_META } from "./pane-action-meta";
import { PaneActionRowMenu } from "./pane-action-row-menu";
import type { PaneActionId } from "./pane-actions";
import { Tooltip } from "./tooltip";

// One pane action given its own seat in the header. Right-click sends it back
// to the menu.
export function PaneToolbarButton({
  id,
  active,
  isDefault,
  onRun,
  onMove,
  onReset,
}: {
  id: PaneActionId;
  active: boolean;
  isDefault: boolean;
  onRun: () => void;
  onMove: () => void;
  onReset: () => void;
}) {
  const meta = PANE_ACTION_META[id];
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  return (
    <span
      className="inline-flex"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <Tooltip
        content={
          <span className="flex flex-col items-end gap-0.5">
            <span>
              {meta.label}
              {meta.shortcut && <span className="ml-1 opacity-70">{meta.shortcut}</span>}
            </span>
            <span className="text-[10px] opacity-60">
              Right-click to move it back to the menu
            </span>
          </span>
        }
        side="bottom"
      >
        <IconBtn onClick={onRun} ariaLabel={meta.label} active={active}>
          {meta.icon}
        </IconBtn>
      </Tooltip>
      {menu && (
        <PaneActionRowMenu
          x={menu.x}
          y={menu.y}
          label={meta.label}
          onToolbar
          isDefault={isDefault}
          onMove={onMove}
          onReset={onReset}
          onClose={() => setMenu(null)}
        />
      )}
    </span>
  );
}
