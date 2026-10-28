import { Archive, ArrowUpRight, Circle, CircleDot, Copy, GitFork, Users } from "lucide-react";
import { ARCHIVE_AGENT_CHORD } from "../agentArchive";
import { AGENT_STATE_LABEL } from "../agentStatus";
import { chordLabel } from "../keys";
import { peerSlugOf } from "../peer/markers";
import type { SidebarAgentRow } from "../sidebarAgents";
import { XIcon } from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuShell } from "./ui/ContextMenuShell";

export type AgentTabAction = "copyAnswer" | "fork" | "share" | "close";

interface SidebarAgentMenuProps {
  x: number;
  y: number;
  projectName: string;
  agent: SidebarAgentRow;
  onOpen: () => void;
  // Absent where the tab can't take requests; the row then only opens.
  onAction?: (action: AgentTabAction) => void;
  // Absent while the agent is still working or asking, which Archive says why.
  onArchive?: () => void;
  onMarkSeen?: () => void;
  onMarkUnread?: () => void;
  onClose: () => void;
}

// Why Archive is out of reach: only a turn that has ended can be put away.
function archiveBlocked(agent: SidebarAgentRow): string {
  return agent.state === "needs-you" ? "Answer it first" : "Available once the turn ends";
}

// An agent row's right-click menu: its tab's own actions, without opening the
// tab first, and putting the row itself away.
export function SidebarAgentMenu({
  x,
  y,
  projectName,
  agent,
  onOpen,
  onAction,
  onArchive,
  onMarkSeen,
  onMarkUnread,
  onClose,
}: SidebarAgentMenuProps) {
  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const act = onAction && agent.terminalId ? (action: AgentTabAction) => close(() => onAction(action)) : null;
  const seen = agent.seenAt !== undefined;

  return (
    <ContextMenuShell x={x} y={y} minWidth={190} onClose={onClose}>
      <div className="px-3 pb-1 pt-1.5 text-[10.5px] text-[var(--text-muted)]">
        {agent.provider} · {AGENT_STATE_LABEL[agent.state]}
        {seen && " · Seen"}
      </div>
      <ContextMenuItem label="Open" icon={<ArrowUpRight size={12} />} onClick={close(onOpen)} />
      {act && (
        <>
          <ContextMenuItem label="Copy last answer" icon={<Copy size={12} />} onClick={act("copyAnswer")} />
          <ContextMenuItem label="Fork session" icon={<GitFork size={12} />} onClick={act("fork")} />
          {!peerSlugOf(projectName) && (
            <ContextMenuItem label="Share tab…" icon={<Users size={12} />} onClick={act("share")} />
          )}
        </>
      )}
      <ContextMenuSeparator />
      {onMarkUnread && (
        <ContextMenuItem label="Mark as unread" icon={<CircleDot size={12} />} onClick={close(onMarkUnread)} />
      )}
      {onMarkSeen && <ContextMenuItem label="Mark as seen" icon={<Circle size={12} />} onClick={close(onMarkSeen)} />}
      <ContextMenuItem
        label="Archive"
        description={onArchive ? undefined : archiveBlocked(agent)}
        icon={<Archive size={12} />}
        shortcut={chordLabel(ARCHIVE_AGENT_CHORD)}
        disabled={!onArchive}
        onClick={close(() => onArchive?.())}
      />
      {act && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem label="Close tab" icon={<XIcon />} onClick={act("close")} />
        </>
      )}
    </ContextMenuShell>
  );
}
