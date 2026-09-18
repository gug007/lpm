import { MoreHorizontalIcon, PanelBottomIcon, UndoIcon } from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuShell } from "./ui/ContextMenuShell";

interface ComposerToolRowMenuProps {
  x: number;
  y: number;
  label: string;
  inToolbar: boolean;
  isDefault: boolean;
  onMove: () => void;
  onReset: () => void;
  onClose: () => void;
}

// Right-click on a tool of the terminal input, wherever it lives: send it
// across, or put the whole button row back the way it ships.
export function ComposerToolRowMenu({
  x,
  y,
  label,
  inToolbar,
  isDefault,
  onMove,
  onReset,
  onClose,
}: ComposerToolRowMenuProps) {
  return (
    <ContextMenuShell x={x} y={y} minWidth={200} onClose={onClose}>
      <ContextMenuItem
        label={inToolbar ? "Move to the More menu" : "Show as a button"}
        icon={inToolbar ? <MoreHorizontalIcon /> : <PanelBottomIcon />}
        title={
          inToolbar
            ? `Tuck ${label} into the More menu`
            : `Give ${label} its own button under the input`
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
            ? "The button row is already laid out the way it ships"
            : "Put every button back where it started"
        }
        onClick={() => {
          onClose();
          onReset();
        }}
      />
    </ContextMenuShell>
  );
}
