import { GitFork, Pin, PinOff } from "lucide-react";
import { PencilIcon, XIcon } from "../icons";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";

interface TabContextMenuProps {
  x: number;
  y: number;
  pinned: boolean;
  canFork: boolean;
  canCloseOthers: boolean;
  onRename: () => void;
  onTogglePin: () => void;
  onFork: () => void;
  onCloseTab: () => void;
  onCloseOthers: () => void;
  onClose: () => void;
}

export function TabContextMenu({
  x,
  y,
  pinned,
  canFork,
  canCloseOthers,
  onRename,
  onTogglePin,
  onFork,
  onCloseTab,
  onCloseOthers,
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
      {canFork && (
        <ContextMenuItem
          label="Fork session"
          icon={<GitFork size={12} />}
          onClick={close(onFork)}
        />
      )}
      <ContextMenuItem
        label="Close"
        icon={<XIcon />}
        destructive
        onClick={close(onCloseTab)}
      />
      <ContextMenuItem
        label="Close Other Tabs"
        icon={<XIcon />}
        destructive
        disabled={!canCloseOthers}
        title={canCloseOthers ? undefined : "No other unpinned tabs"}
        onClick={close(onCloseOthers)}
      />
    </ContextMenuShell>
  );
}
