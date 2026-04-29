import { PencilIcon, TrashIcon } from "../icons";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";

interface ServiceContextMenuProps {
  x: number;
  y: number;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ServiceContextMenu({ x, y, onEdit, onDelete, onClose }: ServiceContextMenuProps) {
  return (
    <ContextMenuShell x={x} y={y} onClose={onClose}>
      <ContextMenuItem
        label="Edit service"
        icon={<PencilIcon />}
        onClick={() => {
          onEdit();
          onClose();
        }}
      />
      <ContextMenuItem
        destructive
        label="Delete service"
        icon={<TrashIcon />}
        onClick={() => {
          onDelete();
          onClose();
        }}
      />
    </ContextMenuShell>
  );
}
