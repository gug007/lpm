import { Pin, PinOff } from "lucide-react";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";

interface TabContextMenuProps {
  x: number;
  y: number;
  pinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
}

export function TabContextMenu({ x, y, pinned, onTogglePin, onClose }: TabContextMenuProps) {
  return (
    <ContextMenuShell x={x} y={y} onClose={onClose}>
      <ContextMenuItem
        label={pinned ? "Unpin" : "Pin"}
        icon={pinned ? <PinOff size={12} /> : <Pin size={12} />}
        onClick={() => {
          onTogglePin();
          onClose();
        }}
      />
    </ContextMenuShell>
  );
}
