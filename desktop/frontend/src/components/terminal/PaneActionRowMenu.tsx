import { MoreHorizontalIcon, PanelTopIcon, UndoIcon } from "../icons";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuSeparator } from "../ui/ContextMenuSeparator";
import { ContextMenuShell } from "../ui/ContextMenuShell";

interface PaneActionRowMenuProps {
  x: number;
  y: number;
  label: string;
  onToolbar: boolean;
  isDefault: boolean;
  onMove: () => void;
  onReset: () => void;
  onClose: () => void;
}

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
}: PaneActionRowMenuProps) {
  return (
    <ContextMenuShell x={x} y={y} minWidth={180} onClose={onClose}>
      <ContextMenuItem
        label={onToolbar ? "Show in the menu instead" : "Show as a button"}
        icon={onToolbar ? <MoreHorizontalIcon /> : <PanelTopIcon />}
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
      <ContextMenuSeparator />
      <ContextMenuItem
        label="Reset to default"
        icon={<UndoIcon />}
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
    </ContextMenuShell>
  );
}
