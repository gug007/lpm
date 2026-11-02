import type { ReactNode } from "react";
import { CircleDot, Copy, GitFork, Pin, PinOff, Sparkles, Users } from "lucide-react";
import { PencilIcon, XIcon } from "../icons";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { chordLabel } from "../../keys";

interface TabContextMenuProps {
  x: number;
  y: number;
  pinned: boolean;
  canFork: boolean;
  canForkCopy: boolean;
  canCloseOthers: boolean;
  canRestoreSessionTitle: boolean;
  canShare: boolean;
  onShare: () => void;
  onRename: () => void;
  onRestoreSessionTitle: () => void;
  onTogglePin: () => void;
  // Absent unless the tab's agent finished and was already seen.
  onMarkUnread?: () => void;
  onFork: () => void;
  onForkCopy: () => void;
  // The Claude account submenu, on a Claude tab when there's more than one.
  accountMenu?: ReactNode;
  onCloseTab: () => void;
  onCloseOthers: () => void;
  onClose: () => void;
}

export function TabContextMenu({
  x,
  y,
  pinned,
  canFork,
  canForkCopy,
  canCloseOthers,
  canRestoreSessionTitle,
  canShare,
  onShare,
  onRename,
  onRestoreSessionTitle,
  onTogglePin,
  onMarkUnread,
  onFork,
  onForkCopy,
  accountMenu,
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
      {canRestoreSessionTitle && (
        <ContextMenuItem
          label="Use conversation title"
          icon={<Sparkles size={12} />}
          onClick={close(onRestoreSessionTitle)}
        />
      )}
      <ContextMenuItem
        label={pinned ? "Unpin" : "Pin"}
        icon={pinned ? <PinOff size={12} /> : <Pin size={12} />}
        onClick={close(onTogglePin)}
      />
      {onMarkUnread && (
        <ContextMenuItem
          label="Mark as unread"
          icon={<CircleDot size={12} />}
          onClick={close(onMarkUnread)}
        />
      )}
      {canFork && (
        <ContextMenuItem
          label="Fork session"
          icon={<GitFork size={12} />}
          onClick={close(onFork)}
        />
      )}
      {canForkCopy && (
        <ContextMenuItem
          label="Fork into copy"
          icon={<Copy size={12} />}
          onClick={close(onForkCopy)}
        />
      )}
      {accountMenu}
      {canShare && (
        <ContextMenuItem
          label="Share tab…"
          icon={<Users size={12} />}
          onClick={close(onShare)}
        />
      )}
      <ContextMenuItem
        label="Close"
        icon={<XIcon />}
        shortcut={chordLabel({ key: "w", meta: true })}
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
