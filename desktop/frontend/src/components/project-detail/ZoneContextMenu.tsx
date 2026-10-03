import { PencilIcon, TrashIcon } from "../icons";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuSeparator } from "../ui/ContextMenuSeparator";
import { ContextMenuShell } from "../ui/ContextMenuShell";

interface ZoneContextMenuProps {
  x: number;
  y: number;
  // False when the zone's file is out of this Mac's reach.
  editable: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onClose: () => void;
}

export function ZoneContextMenu({ x, y, editable, onEdit, onRemove, onClose }: ZoneContextMenuProps) {
  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };
  return (
    <ContextMenuShell x={x} y={y} onClose={onClose}>
      <ContextMenuItem label="Edit zone…" icon={<PencilIcon />} disabled={!editable} onClick={close(onEdit)} />
      <ContextMenuSeparator />
      <ContextMenuItem
        destructive
        label="Remove zone"
        icon={<TrashIcon />}
        disabled={!editable}
        onClick={close(onRemove)}
      />
    </ContextMenuShell>
  );
}
