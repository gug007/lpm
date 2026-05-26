import { Pin, PinOff } from "lucide-react";
import { PencilIcon } from "../icons";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";

interface TabContextMenuProps {
  x: number;
  y: number;
  pinned: boolean;
  onRename: () => void;
  onTogglePin: () => void;
  onClose: () => void;
}

export function TabContextMenu({
  x,
  y,
  pinned,
  onRename,
  onTogglePin,
  onClose,
}: TabContextMenuProps) {
  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };
  return (
    <ContextMenuShell x={x} y={y} onClose={onClose}>
      <ContextMenuItem
        label="Rename"
        icon={<PencilIcon />}
        onClick={close(onRename)}
      />
      <ContextMenuItem
        label={pinned ? "Unpin" : "Pin"}
        icon={pinned ? <PinOff size={12} /> : <Pin size={12} />}
        onClick={close(onTogglePin)}
      />
    </ContextMenuShell>
  );
}
