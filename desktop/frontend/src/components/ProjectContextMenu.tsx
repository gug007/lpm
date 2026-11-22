import { ClipboardIcon, CopyIcon, DetachIcon, DownloadIcon, HardDriveIcon, PencilIcon, TrashIcon, WorktreeIcon } from "./icons";
import type { SidebarAgentRow } from "../sidebarAgents";
import { ProjectArchiveMenuItems } from "./ProjectArchiveMenuItems";
import { Archive, Link2, Pin, PinOff } from "lucide-react";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { CopySpaceMenuItem } from "./CopySpaceMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuShell } from "./ui/ContextMenuShell";
import { ContextMenuSubmenu } from "./ui/ContextMenuSubmenu";
import { MoveToFolderSubmenu } from "./MoveToFolderSubmenu";
import { OpenInBrowserSubmenu } from "./OpenInBrowserSubmenu";
import { ProjectGitSubmenu } from "./ProjectGitSubmenu";
import { ProjectMoreSubmenu, type ProjectMoreSubmenuProps } from "./ProjectMoreSubmenu";
import {
  launchOpenInTarget,
  primaryOpenInTarget,
  projectOpenInTargets,
  useOpenInTargets,
} from "../hooks/useOpenInTargets";
import type { CustomWorkStatus, ProjectGroup, WorkStatus } from "../types";
import type { WorkStatusChoice } from "../workStatus";
import { WorkStatusSubmenu } from "./WorkStatusSubmenu";
import { MACHINE } from "../machineWords";
import { copyLink, projectLink } from "../openLinks";

// The sync controls a row only has while a copy of it is synced here. The remote
// project's row and the copy's own row both get them, since either is a way to
// reach the same sync; `onOpenCopy` is set only on the row that is not the copy.
export interface FollowingMenuState {
  macName: string;
  paused: boolean;
  onOpenCopy?: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRemoveCopy: () => void;
}

interface ProjectContextMenuProps extends ProjectMoreSubmenuProps {
  x: number;
  y: number;
  duplicateDisabled: boolean;
  isWorktree: boolean;
  // That Mac is reached over SSH, so a Remote-SSH editor can open the project.
  peerViaSsh: boolean;
  // Limits "Open with" to editors that can open a remote folder (VS Code-family
  // Remote-SSH).
  sshRemote: boolean;
  projectLabel: string;
  // What the project has agents on, as its sidebar rows list them.
  agents: SidebarAgentRow[];
  running: boolean;
  services: { name: string; port: number }[];
  projectPath: string | null;
  // The folders this project can be filed into: its own Mac's. Null where there
  // are none to reach — a paired Mac whose lpm doesn't share its folders.
  groups: ProjectGroup[] | null;
  currentGroupId: string | null;
  // The project's own status, the statuses the menu offers, and the ways to
  // set, add or edit them; the submenu shows on every local project.
  workStatus?: WorkStatus;
  customWorkStatuses: CustomWorkStatus[];
  workStatusOrder?: string[];
  onPickWorkStatus: (choice: WorkStatusChoice | null) => void;
  onAddWorkStatus: () => void;
  onEditWorkStatus: (entry: CustomWorkStatus) => void;
  onRemoveWorkStatus: (entry: CustomWorkStatus) => void;
  onReorderWorkStatuses: (order: string[]) => void;
  // Kept at the top of the sidebar.
  pinned: boolean;
  onTogglePin: (pin: boolean) => void;
  // Absent while the project can't be archived (it's being removed or copied).
  onArchive?: () => void;
  onRename: () => void;
  renameShortcut?: string;
  deleteShortcut?: string;
  onBulkDuplicate: () => void;
  onWorktree: () => void;
  // Omitted unless this is a project on a paired Mac that can be synced here.
  onSyncHere?: () => void;
  // Set only while this project is following a Mac.
  following?: FollowingMenuState;
  onCopyPath: () => void;
  onGitCommit: () => void;
  onGitCreatePR: () => void;
  onGitSwitchBranch: () => void;
  onGitHistory: () => void;
  onGitDiscardAll: () => void;
  onMoveToGroup: (groupId: string | null) => void;
  onCreateGroupWith: () => void;
  onRemove: () => void;
}

export function ProjectContextMenu(props: ProjectContextMenuProps) {
  const {
    x,
    y,
    duplicateDisabled,
    removeDisabled,
    isDuplicate,
    isWorktree,
    peerViaSsh,
    sshRemote,
    projectName,
    projectLabel,
    agents,
    running,
    services,
    projectPath,
    groups,
    currentGroupId,
    workStatus,
    customWorkStatuses,
    workStatusOrder,
    onPickWorkStatus,
    onAddWorkStatus,
    onEditWorkStatus,
    onRemoveWorkStatus,
    onReorderWorkStatuses,
    pinned,
    onTogglePin,
    onArchive,
    onRename,
    renameShortcut,
    deleteShortcut,
    onBulkDuplicate,
    onWorktree,
    onSyncHere,
    following,
    onCopyPath,
    onGitCommit,
    onGitCreatePR,
    onGitSwitchBranch,
    onGitHistory,
    onGitDiscardAll,
    onMoveToGroup,
    onCreateGroupWith,
    onRemove,
    onClose,
  } = props;
  const openInTargets = projectOpenInTargets(useOpenInTargets(), projectPath ?? "", {
    isRemote: sshRemote,
    peerViaSsh,
  });
  const primaryTarget = primaryOpenInTarget(openInTargets);
  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <ContextMenuShell x={x} y={y} minWidth={180} onClose={onClose}>
      <ProjectArchiveMenuItems projectName={projectName} label={projectLabel} agents={agents} onClose={onClose} />
      {projectPath && openInTargets.length > 0 && (
        <ContextMenuSubmenu
          label="Open with"
          icon={primaryTarget ? <img src={primaryTarget.icon} alt="" className="h-4 w-4 shrink-0" /> : undefined}
          onActivate={
            primaryTarget
              ? () => {
                  launchOpenInTarget(primaryTarget, projectPath);
                  onClose();
                }
              : undefined
          }
        >
          {openInTargets.map((t) => (
            <ContextMenuItem
              key={t.id}
              label={t.label}
              icon={<img src={t.icon} alt="" className="h-4 w-4 shrink-0" />}
              onClick={() => {
                launchOpenInTarget(t, projectPath);
                onClose();
              }}
            />
          ))}
        </ContextMenuSubmenu>
      )}
      <OpenInBrowserSubmenu
        projectName={projectName}
        running={running}
        services={services}
        onClose={onClose}
      />
      <ContextMenuItem label="Copy path" icon={<ClipboardIcon />} onClick={close(onCopyPath)} />
      <ContextMenuItem label="Copy link" icon={<Link2 size={12} />} onClick={close(() => void copyLink(projectLink(projectName)))} />
      <ContextMenuSeparator />
      <ProjectGitSubmenu
        projectPath={projectPath}
        projectName={projectName}
        autoPull={!sshRemote}
        onCommit={onGitCommit}
        onCreatePR={onGitCreatePR}
        onSwitchBranch={onGitSwitchBranch}
        onHistory={onGitHistory}
        onDiscardAll={onGitDiscardAll}
        onClose={onClose}
      />
      <WorkStatusSubmenu
        current={workStatus}
        custom={customWorkStatuses}
        order={workStatusOrder}
        onPick={onPickWorkStatus}
        onAdd={onAddWorkStatus}
        onEdit={onEditWorkStatus}
        onRemove={onRemoveWorkStatus}
        onReorder={onReorderWorkStatuses}
        onClose={onClose}
      />
      <ContextMenuSeparator />
      <ContextMenuItem
        label="Duplicate"
        icon={<CopyIcon />}
        onClick={close(onBulkDuplicate)}
        disabled={duplicateDisabled}
      />
      <ContextMenuItem
        label="New worktree"
        icon={<WorktreeIcon />}
        onClick={close(onWorktree)}
        disabled={duplicateDisabled}
      />
      {!sshRemote && <CopySpaceMenuItem projectName={projectName} onClose={onClose} />}
      {onSyncHere && (
        <ContextMenuItem
          label={`Sync to ${MACHINE.ThisMachineTitle}…`}
          icon={<DownloadIcon />}
          onClick={close(onSyncHere)}
        />
      )}
      {following && (
        <>
          {following.onOpenCopy && (
            <ContextMenuItem
              label={`Open Copy on ${MACHINE.ThisMachineTitle}`}
              icon={<HardDriveIcon />}
              onClick={close(following.onOpenCopy)}
            />
          )}
          {following.paused ? (
            <ContextMenuItem
              label="Resume Syncing"
              icon={<DownloadIcon />}
              onClick={close(following.onResume)}
            />
          ) : (
            <ContextMenuItem
              label="Pause Syncing"
              icon={<DetachIcon />}
              onClick={close(following.onPause)}
            />
          )}
          <ContextMenuItem
            label="Stop Syncing"
            icon={<DetachIcon />}
            onClick={close(following.onStop)}
          />
          <ContextMenuItem
            label="Remove Synced Copy…"
            icon={<TrashIcon />}
            destructive
            onClick={close(following.onRemoveCopy)}
          />
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem
        label="Rename"
        icon={<PencilIcon />}
        shortcut={renameShortcut}
        onClick={close(onRename)}
      />
      <ContextMenuItem
        label={pinned ? "Unpin" : "Pin to top"}
        icon={pinned ? <PinOff size={14} /> : <Pin size={14} />}
        onClick={close(() => onTogglePin(!pinned))}
      />
      {onArchive && (
        <ContextMenuItem label="Archive project" icon={<Archive size={14} />} onClick={close(onArchive)} />
      )}
      {groups && (
        <MoveToFolderSubmenu
          groups={groups}
          disabledGroupId={currentGroupId}
          showRemove={Boolean(currentGroupId)}
          onMoveToGroup={onMoveToGroup}
          onCreateGroupWith={onCreateGroupWith}
          onClose={onClose}
        />
      )}
      <ContextMenuSeparator />
      <ProjectMoreSubmenu {...props} />
      <ContextMenuSeparator />
      <ContextMenuItem
        destructive
        label={
          isWorktree
            ? "Delete worktree"
            : isDuplicate
              ? "Delete duplicate"
              : "Remove from lpm"
        }
        icon={<TrashIcon />}
        shortcut={deleteShortcut}
        onClick={close(onRemove)}
        disabled={removeDisabled}
      />
    </ContextMenuShell>
  );
}
