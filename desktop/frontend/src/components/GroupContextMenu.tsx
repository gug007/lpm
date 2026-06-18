import { FolderIcon, PencilIcon, TrashIcon } from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuShell } from "./ui/ContextMenuShell";

interface GroupContextMenuProps {
  x: number;
  y: number;
  onRename: () => void;
  onNewFolder: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function GroupContextMenu({
  x,
  y,
  onRename,
  onNewFolder,
  onDelete,
  onClose,
}: GroupContextMenuProps) {
  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };
  return (
    <ContextMenuShell x={x} y={y} minWidth={180} onClose={onClose}>
      <ContextMenuItem label="Rename folder" icon={<PencilIcon />} onClick={close(onRename)} />
      <ContextMenuItem label="New folder" icon={<FolderIcon />} onClick={close(onNewFolder)} />
      <ContextMenuSeparator />
      <ContextMenuItem
        destructive
        label="Delete folder"
        icon={<TrashIcon />}
        onClick={close(onDelete)}
      />
    </ContextMenuShell>
  );
}
