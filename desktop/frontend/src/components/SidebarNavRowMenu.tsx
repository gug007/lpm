import { MoreHorizontalIcon, SidebarIcon, UndoIcon } from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuShell } from "./ui/ContextMenuShell";

interface SidebarNavRowMenuProps {
  x: number;
  y: number;
  label: string;
  inSidebar: boolean;
  isDefault: boolean;
  onMove: () => void;
  onReset: () => void;
  onClose: () => void;
}

export function SidebarNavRowMenu({
  x,
  y,
  label,
  inSidebar,
  isDefault,
  onMove,
  onReset,
  onClose,
}: SidebarNavRowMenuProps) {
  return (
    <ContextMenuShell x={x} y={y} minWidth={180} onClose={onClose}>
      <ContextMenuItem
        label={inSidebar ? "Move to the More menu" : "Move to the sidebar"}
        icon={inSidebar ? <MoreHorizontalIcon /> : <SidebarIcon />}
        title={
          inSidebar
            ? `Tuck ${label} back into the More menu`
            : `Give ${label} its own row in the sidebar`
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
            ? "The footer is already laid out the way it ships"
            : "Put every row back where it started"
        }
        onClick={() => {
          onClose();
          onReset();
        }}
      />
    </ContextMenuShell>
  );
}
