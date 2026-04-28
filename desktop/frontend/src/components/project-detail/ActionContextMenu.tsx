import { PencilIcon, TrashIcon } from "../icons";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";

interface ActionContextMenuProps {
  x: number;
  y: number;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ActionContextMenu({ x, y, onEdit, onDelete, onClose }: ActionContextMenuProps) {
  return (
    <ContextMenuShell x={x} y={y} onClose={onClose}>
      <ContextMenuItem
        label="Edit action"
        icon={<PencilIcon />}
        onClick={() => {
          onEdit();
          onClose();
        }}
      />
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
