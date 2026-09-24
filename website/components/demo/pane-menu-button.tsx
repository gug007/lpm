"use client";

import { useRef, useState } from "react";
import { MoreHorizontal, Pin, Undo2 } from "lucide-react";
import { IconBtn } from "./icon-btn";
import { MenuButton, MenuSeparator } from "./menu-button";
import { MENU_PANEL_CLASS, MenuLayer } from "./menu-layer";
import { PANE_ACTION_META } from "./pane-action-meta";
import { PaneActionRowMenu } from "./pane-action-row-menu";
import type { PaneActionId } from "./pane-actions";
import { Tooltip } from "./tooltip";

type RowMenu = { id: PaneActionId; x: number; y: number };

// The pane's "more" menu: the actions not given a toolbar button. It sits in
// the header's right-hand group, so the menu hangs from its right edge. Each
// row's pin (or a right-click on it) gives the action a button of its own.
export function PaneMenuButton({
  actions,
  isDefault,
  onRun,
  onMove,
  onReset,
}: {
  actions: PaneActionId[];
  isDefault: boolean;
  onRun: (id: PaneActionId) => void;
  onMove: (id: PaneActionId) => void;
  onReset: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [menu, setMenu] = useState<{ right: number; top: number } | null>(null);
  const [rowMenu, setRowMenu] = useState<RowMenu | null>(null);

  const toggleMenu = () => {
    if (menu) {
      setMenu(null);
      return;
    }
    const r = ref.current?.getBoundingClientRect();
    if (r) setMenu({ right: window.innerWidth - r.right, top: r.bottom + 4 });
  };

  const pick = (action: () => void) => () => {
    action();
    setMenu(null);
  };

  return (
    // The mousedown must not reach the menu's outside-click listener, or a
    // click on the open button would close and reopen it.
    <span ref={ref} className="inline-flex" onMouseDown={(e) => e.stopPropagation()}>
      <Tooltip content="More options" side="bottom">
        <IconBtn onClick={toggleMenu} ariaLabel="More options" active={!!menu}>
          <MoreHorizontal />
        </IconBtn>
      </Tooltip>
      {menu && (
        <MenuLayer onClose={() => setMenu(null)}>
          <div
            role="menu"
            style={{ right: menu.right, top: menu.top, minWidth: 190 }}
            className={MENU_PANEL_CLASS}
          >
            {actions.map((id) => (
              <div
                key={id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu(null);
                  setRowMenu({ id, x: e.clientX, y: e.clientY });
                }}
              >
                <MenuButton
                  icon={PANE_ACTION_META[id].icon}
                  label={PANE_ACTION_META[id].label}
                  hint={PANE_ACTION_META[id].shortcut}
                  tourTarget={`pane-action:${id}`}
                  onClick={pick(() => onRun(id))}
                  trailingAction={{
                    label: "Show as a button",
                    icon: <Pin className="h-3 w-3" />,
                    onClick: pick(() => onMove(id)),
                  }}
                />
              </div>
            ))}
            {!isDefault && (
              <>
                <MenuSeparator />
                <MenuButton
                  icon={<Undo2 className="h-3.5 w-3.5" />}
                  label="Reset to default"
                  title="Put every action back where it started"
                  onClick={pick(onReset)}
                />
              </>
            )}
          </div>
        </MenuLayer>
      )}
      {rowMenu && (
        <PaneActionRowMenu
          x={rowMenu.x}
          y={rowMenu.y}
          label={PANE_ACTION_META[rowMenu.id].label}
          onToolbar={false}
          isDefault={isDefault}
          onMove={() => onMove(rowMenu.id)}
          onReset={onReset}
          onClose={() => setRowMenu(null)}
        />
      )}
    </span>
  );
}
