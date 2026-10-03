import { PencilIcon, PlusIcon, TrashIcon } from "../icons";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuSeparator } from "../ui/ContextMenuSeparator";
import { ContextMenuShell } from "../ui/ContextMenuShell";

interface ZoneContextMenuProps {
  x: number;
  y: number;
  // False when the zone's file is out of this Mac's reach.
  editable: boolean;
  canRemoveLayer: boolean;
  // The open layer's label, when it has one.
  layerLabel?: string;
  onNewLayer: () => void;
  onEdit: () => void;
  onRemoveLayer: () => void;
  onRemove: () => void;
  onClose: () => void;
}

export function ZoneContextMenu({
  x,
  y,
  editable,
  canRemoveLayer,
  layerLabel,
  onNewLayer,
  onEdit,
  onRemoveLayer,
  onRemove,
  onClose,
}: ZoneContextMenuProps) {
  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };
  return (
    <ContextMenuShell x={x} y={y} onClose={onClose}>
      <ContextMenuItem label="New layer" icon={<PlusIcon />} disabled={!editable} onClick={close(onNewLayer)} />
      <ContextMenuItem label="Edit zone…" icon={<PencilIcon />} disabled={!editable} onClick={close(onEdit)} />
      <ContextMenuSeparator />
      {canRemoveLayer && (
        <ContextMenuItem
          destructive
          label={layerLabel ? `Remove layer “${layerLabel}”` : "Remove layer"}
          icon={<TrashIcon />}
          disabled={!editable}
          onClick={close(onRemoveLayer)}
        />
      )}
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
