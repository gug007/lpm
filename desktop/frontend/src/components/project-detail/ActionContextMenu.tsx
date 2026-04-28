import { TrashIcon } from "../icons";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";

interface ActionContextMenuProps {
  x: number;
  y: number;
  onDelete: () => void;
  onClose: () => void;
}

export function ActionContextMenu({ x, y, onDelete, onClose }: ActionContextMenuProps) {
  return (
    <ContextMenuShell x={x} y={y} onClose={onClose}>
      <ContextMenuItem
        destructive
        label="Delete action"
        icon={<TrashIcon />}
        onClick={() => {
          onDelete();
          onClose();
        }}
      />
    </ContextMenuShell>
  );
}
