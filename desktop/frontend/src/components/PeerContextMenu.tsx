import { Link, Power } from "lucide-react";
import {
  DownloadIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  SettingsIcon,
  SmartphoneIcon,
  XIcon,
} from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuShell } from "./ui/ContextMenuShell";

interface PeerContextMenuProps {
  x: number;
  y: number;
  alias: string;
  connected: boolean;
  canReconnect: boolean;
  /// Set while the machine is behind and can be updated from here.
  updateLabel?: string;
  /// Set while it is turned off here, or no longer accepts this machine: what
  /// brings it back.
  onTurnOn?: () => void;
  onPairAgain?: () => void;
  /// Where its connection is set up here, offered while it isn't connected.
  onConnectionSettings: () => void;
  onAddProject: () => void;
  onPairPhone: () => void;
  onSettings: () => void;
  onUpdate: () => void;
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
  updateLabel,
  onTurnOn,
  onPairAgain,
  onConnectionSettings,
  onAddProject,
  onPairPhone,
  onSettings,
  onUpdate,
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
      {onTurnOn && <ContextMenuItem label={`Turn on ${alias}`} icon={<Power size={13} />} onClick={close(onTurnOn)} />}
      {onPairAgain && <ContextMenuItem label="Pair again…" icon={<Link size={13} />} onClick={close(onPairAgain)} />}
      {connected && (
        <ContextMenuItem
          label={`Add project on ${alias}`}
          icon={<PlusIcon />}
          onClick={close(onAddProject)}
        />
      )}
      {connected && (
        <ContextMenuItem
          label="Pair a phone…"
          icon={<SmartphoneIcon />}
          onClick={close(onPairPhone)}
        />
      )}
      {connected && (
        <ContextMenuItem
          label={`Settings on ${alias}…`}
          icon={<SettingsIcon />}
          onClick={close(onSettings)}
        />
      )}
      {updateLabel && (
        <ContextMenuItem label={updateLabel} icon={<DownloadIcon />} onClick={close(onUpdate)} />
      )}
      {canReconnect && (
        <ContextMenuItem label="Reconnect" icon={<RefreshIcon />} onClick={close(onReconnect)} />
      )}
      {!connected && (
        <ContextMenuItem
          label="Connection settings…"
          icon={<SettingsIcon />}
          onClick={close(onConnectionSettings)}
        />
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
