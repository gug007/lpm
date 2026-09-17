import { useRef, useState } from "react";
import { Pin } from "lucide-react";
import type { PaneActionId } from "../../paneActions";
import { MoreHorizontalIcon, UndoIcon } from "../icons";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuSeparator } from "../ui/ContextMenuSeparator";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { Tooltip } from "../ui/Tooltip";
import { IconBtn } from "./IconBtn";
import { PaneActionRowMenu } from "./PaneActionRowMenu";
import { PANE_ACTION_META } from "./paneActionMeta";

interface PaneMenuButtonProps {
  actions: PaneActionId[];
  isDefault: boolean;
  onRun: (id: PaneActionId) => void;
  onMove: (id: PaneActionId) => void;
  onReset: () => void;
}

interface RowMenu {
  id: PaneActionId;
  x: number;
  y: number;
}

// The pane's "more" menu: the actions not given a toolbar button. It sits in
// the header's right-hand group, so the menu hangs from its right edge. Each
// row's pin (or a right-click on it) gives the action a button of its own.
export function PaneMenuButton({ actions, isDefault, onRun, onMove, onReset }: PaneMenuButtonProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [rowMenu, setRowMenu] = useState<RowMenu | null>(null);

  const toggleMenu = () => {
    if (menu) {
      setMenu(null);
      return;
    }
    const r = ref.current?.getBoundingClientRect();
    if (r) setMenu({ x: r.right, y: r.bottom + 4 });
  };

  const pick = (action: () => void) => () => {
    action();
    setMenu(null);
  };

  return (
    // The mousedown must not reach the menu's outside-click listener, or a
    // click on the open button would close and reopen it.
    <span ref={ref} className="inline-flex" onMouseDown={(e) => e.stopPropagation()}>
      <Tooltip content="More options" side="bottom" align="end">
        <IconBtn onClick={toggleMenu} ariaLabel="More options" active={!!menu}>
          <MoreHorizontalIcon />
        </IconBtn>
      </Tooltip>
      {menu && (
        <ContextMenuShell x={menu.x} y={menu.y} align="end" minWidth={180} onClose={() => setMenu(null)}>
          {actions.map((id) => (
            <div
              key={id}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu(null);
                setRowMenu({ id, x: e.clientX, y: e.clientY });
              }}
            >
              <ContextMenuItem
                label={PANE_ACTION_META[id].label}
                icon={PANE_ACTION_META[id].icon}
                shortcut={PANE_ACTION_META[id].shortcut}
                onClick={pick(() => onRun(id))}
                trailingAction={{
                  label: "Show as a button",
                  icon: <Pin size={12} strokeWidth={1.75} />,
                  onClick: pick(() => onMove(id)),
                }}
              />
            </div>
          ))}
          {!isDefault && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                label="Reset to default"
                icon={<UndoIcon />}
                title="Put every action back where it started"
                onClick={pick(onReset)}
              />
            </>
          )}
        </ContextMenuShell>
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
