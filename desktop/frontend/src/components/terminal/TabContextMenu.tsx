import type { ReactNode } from "react";
import { CircleCheck, CircleDot, Copy, GitFork, Link2, PictureInPicture2, Pin, PinOff, Sparkles, TimerOff, Users } from "lucide-react";
import { FINISH_PAUSED_LABEL } from "../../agentPause";
import { PencilIcon, XIcon } from "../icons";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuSeparator } from "../ui/ContextMenuSeparator";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { chordLabel } from "../../keys";
import { miniViewChordLabel } from "../../miniViewChord";
import { SplitDownIcon, SplitRightIcon } from "./icons";
import type { PaneEdge } from "../../paneMoves";

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
  // Absent where the tab has no key a link could find it by.
  onCopyLink?: () => void;
  onRename: () => void;
  onRestoreSessionTitle: () => void;
  onTogglePin: () => void;
  // Absent unless the tab's agent finished and was already seen.
  onMarkUnread?: () => void;
  // Present while the tab's agent sits paused: says its work is over.
  onFinishPause?: () => void;
  onFork: () => void;
  onForkCopy: () => void;
  // The Claude account submenu, on a Claude tab when there's more than one.
  accountMenu?: ReactNode;
  // "Continue on", where the tab's session can move to another computer.
  continueMenu?: ReactNode;
  // "Move to", the other projects on the tab's computer.
  moveMenu?: ReactNode;
  // Absent when the pane would be left with nothing to show.
  onMoveToNewPane?: (edge: Exclude<PaneEdge, "left">) => void;
  // Keeps the tab in a mini view, or takes it out; absent where none can show
  // (a detached window, a service log).
  onToggleMiniView?: () => void;
  miniViewKept?: boolean;
  // Set on a tab waiting for its agent before it closes: takes that back.
  onKeepOpen?: () => void;
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
  onCopyLink,
  onRename,
  onRestoreSessionTitle,
  onTogglePin,
  onMarkUnread,
  onFinishPause,
  onFork,
  onForkCopy,
  accountMenu,
  continueMenu,
  moveMenu,
  onMoveToNewPane,
  onToggleMiniView,
  miniViewKept = false,
  onKeepOpen,
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
      {onFinishPause && (
        <ContextMenuItem
          label={FINISH_PAUSED_LABEL}
          icon={<CircleCheck size={12} />}
          onClick={close(onFinishPause)}
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
      {continueMenu}
      {moveMenu}
      {canShare && (
        <ContextMenuItem
          label="Share tab…"
          icon={<Users size={12} />}
          onClick={close(onShare)}
        />
      )}
      {onCopyLink && (
        <ContextMenuItem
          label="Copy link to tab"
          icon={<Link2 size={12} />}
          onClick={close(onCopyLink)}
        />
      )}
      {onToggleMiniView && (
        <ContextMenuItem
          label={miniViewKept ? "Close mini view" : "Keep in a mini view"}
          icon={<PictureInPicture2 size={12} />}
          shortcut={miniViewChordLabel()}
          onClick={close(onToggleMiniView)}
        />
      )}
      {onMoveToNewPane && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            label="Move to new pane right"
            icon={<SplitRightIcon />}
            onClick={close(() => onMoveToNewPane("right"))}
          />
          <ContextMenuItem
            label="Move to new pane below"
            icon={<SplitDownIcon />}
            onClick={close(() => onMoveToNewPane("bottom"))}
          />
          <ContextMenuSeparator />
        </>
      )}
      {onKeepOpen && (
        <ContextMenuItem label="Keep open" icon={<TimerOff size={12} />} onClick={close(onKeepOpen)} />
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
