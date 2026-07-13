import { CheckSquareIcon, ClipboardIcon, CopyIcon, DetachIcon, HardDriveIcon, PencilIcon, TrashIcon } from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuShell } from "./ui/ContextMenuShell";
import { ContextMenuSubmenu } from "./ui/ContextMenuSubmenu";
import { MoveToFolderSubmenu } from "./MoveToFolderSubmenu";
import { OpenInBrowserSubmenu } from "./OpenInBrowserSubmenu";
import { ProjectGitSubmenu } from "./ProjectGitSubmenu";
import { launchOpenInTarget, primaryOpenInTarget, useOpenInTargets } from "../hooks/useOpenInTargets";
import type { ProjectGroup } from "../types";

interface ProjectContextMenuProps {
  x: number;
  y: number;
  duplicateDisabled: boolean;
  removeDisabled: boolean;
  isDuplicate: boolean;
  isDetached: boolean;
  canSelect: boolean;
  // A project living on a paired Mac. Hides items that would act on the wrong
  // machine or a local-only concept (open-with, browser, detach, folders,
  // select); Git / Duplicate / Rename / Copy path / Remove stay and route to
  // the peer.
  remote: boolean;
  // An SSH project (root lives on an SSH host). Limits "Open with" to editors
  // that can open a remote folder (VS Code-family Remote-SSH).
  sshRemote: boolean;
  projectName: string;
  running: boolean;
  services: { name: string; port: number }[];
  projectPath: string | null;
  groups: ProjectGroup[];
  currentGroupId: string | null;
  onRename: () => void;
  onBulkDuplicate: () => void;
  onCopyPath: () => void;
  onDetach: () => void;
  onAttach: () => void;
  onSelect: () => void;
  onGitCommit: () => void;
  onGitCreatePR: () => void;
  onGitSwitchBranch: () => void;
  onGitDiscardAll: () => void;
  onMoveToGroup: (groupId: string | null) => void;
  onCreateGroupWith: () => void;
  onRemove: () => void;
  onRemoveFromDisk?: () => void;
  onClose: () => void;
}

export function ProjectContextMenu({
  x,
  y,
  duplicateDisabled,
  removeDisabled,
  isDuplicate,
  isDetached,
  canSelect,
  remote,
  sshRemote,
  projectName,
  running,
  services,
  projectPath,
  groups,
  currentGroupId,
  onRename,
  onBulkDuplicate,
  onCopyPath,
  onDetach,
  onAttach,
  onSelect,
  onGitCommit,
  onGitCreatePR,
  onGitSwitchBranch,
  onGitDiscardAll,
  onMoveToGroup,
  onCreateGroupWith,
  onRemove,
  onRemoveFromDisk,
  onClose,
}: ProjectContextMenuProps) {
  const openInTargets = useOpenInTargets().filter((t) => !t.fileOnly && (!sshRemote || t.remoteCapable));
  const primaryTarget = primaryOpenInTarget(openInTargets);
  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <ContextMenuShell x={x} y={y} minWidth={180} onClose={onClose}>
      {!remote && projectPath && openInTargets.length > 0 && (
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
      <ProjectGitSubmenu
        projectPath={projectPath}
        onCommit={onGitCommit}
        onCreatePR={onGitCreatePR}
        onSwitchBranch={onGitSwitchBranch}
        onDiscardAll={onGitDiscardAll}
        onClose={onClose}
      />
      <ContextMenuItem
        label="Duplicate"
        icon={<CopyIcon />}
        onClick={close(onBulkDuplicate)}
        disabled={duplicateDisabled}
      />
      {!remote && (
        <OpenInBrowserSubmenu
          projectName={projectName}
          running={running}
          services={services}
          onClose={onClose}
        />
      )}
      <ContextMenuItem label="Rename" icon={<PencilIcon />} onClick={close(onRename)} />
      <ContextMenuItem label="Copy path" icon={<ClipboardIcon />} onClick={close(onCopyPath)} />
      {!remote &&
        (isDetached ? (
          <ContextMenuItem
            label="Attach to main window"
            icon={<DetachIcon />}
            onClick={close(onAttach)}
          />
        ) : (
          <ContextMenuItem
            label="Detach to new window"
            icon={<DetachIcon />}
            onClick={close(onDetach)}
          />
        ))}
      {!remote && (
        <MoveToFolderSubmenu
          groups={groups}
          disabledGroupId={currentGroupId}
          showRemove={Boolean(currentGroupId)}
          onMoveToGroup={onMoveToGroup}
          onCreateGroupWith={onCreateGroupWith}
          onClose={onClose}
        />
      )}
      {!remote && canSelect && (
        <ContextMenuItem
          label="Select"
          icon={<CheckSquareIcon />}
          onClick={close(onSelect)}
        />
      )}
      <ContextMenuSeparator />
      <ContextMenuItem
        destructive
        label={isDuplicate ? "Delete duplicate" : "Remove from lpm"}
        icon={<TrashIcon />}
        onClick={close(onRemove)}
        disabled={removeDisabled}
      />
      {onRemoveFromDisk && (
        <ContextMenuItem
          destructive
          label="Remove from disk"
          icon={<HardDriveIcon />}
          onClick={close(onRemoveFromDisk)}
          disabled={removeDisabled}
        />
      )}
    </ContextMenuShell>
  );
}
