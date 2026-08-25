import { PencilIcon, PlusIcon, RefreshIcon, XIcon } from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuShell } from "./ui/ContextMenuShell";

interface PeerContextMenuProps {
  x: number;
  y: number;
  alias: string;
  connected: boolean;
  canReconnect: boolean;
  onAddProject: () => void;
  onRename: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  onClose: () => void;
}

export function PeerContextMenu({
  x,
  y,
  alias,
  connected,
  canReconnect,
  onAddProject,
  onRename,
  onReconnect,
  onDisconnect,
  onClose,
}: PeerContextMenuProps) {
  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };
  return (
    <ContextMenuShell x={x} y={y} minWidth={180} onClose={onClose}>
      {connected && (
        <ContextMenuItem
          label={`Add project on ${alias}`}
          icon={<PlusIcon />}
          onClick={close(onAddProject)}
        />
      )}
      {canReconnect && (
        <ContextMenuItem label="Reconnect" icon={<RefreshIcon />} onClick={close(onReconnect)} />
      )}
      <ContextMenuItem label="Rename" icon={<PencilIcon />} onClick={close(onRename)} />
      <ContextMenuSeparator />
      <ContextMenuItem
        destructive
        label="Disconnect…"
        icon={<XIcon />}
        onClick={close(onDisconnect)}
      />
    </ContextMenuShell>
  );
}
