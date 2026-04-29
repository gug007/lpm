import { PencilIcon, TrashIcon } from "../icons";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";

interface ProfileContextMenuProps {
  x: number;
  y: number;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ProfileContextMenu({ x, y, onEdit, onDelete, onClose }: ProfileContextMenuProps) {
  return (
    <ContextMenuShell x={x} y={y} onClose={onClose}>
      <ContextMenuItem
        label="Edit profile"
        icon={<PencilIcon />}
        onClick={() => {
          onEdit();
          onClose();
        }}
      />
      <ContextMenuItem
        destructive
        label="Delete profile"
        icon={<TrashIcon />}
        onClick={() => {
          onDelete();
          onClose();
        }}
      />
    </ContextMenuShell>
  );
}
