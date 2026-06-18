import { CheckSquareIcon, ChevronRightIcon, ClipboardIcon, CopyIcon, DetachIcon, FolderIcon, PencilIcon, TrashIcon } from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuShell } from "./ui/ContextMenuShell";
import { ContextMenuSubmenu } from "./ui/ContextMenuSubmenu";
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
  projectPath: string | null;
  groups: ProjectGroup[];
  currentGroupId: string | null;
  onRename: () => void;
  onBulkDuplicate: () => void;
  onCopyPath: () => void;
  onDetach: () => void;
  onAttach: () => void;
  onSelect: () => void;
  onMoveToGroup: (groupId: string | null) => void;
  onCreateGroupWith: () => void;
  onRemove: () => void;
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
  projectPath,
  groups,
  currentGroupId,
  onRename,
  onBulkDuplicate,
  onCopyPath,
  onDetach,
  onAttach,
  onSelect,
  onMoveToGroup,
  onCreateGroupWith,
  onRemove,
  onClose,
}: ProjectContextMenuProps) {
  const openInTargets = useOpenInTargets().filter((t) => !t.fileOnly);
  const primaryTarget = primaryOpenInTarget(openInTargets);
  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <ContextMenuShell x={x} y={y} minWidth={180} onClose={onClose}>
      <ContextMenuItem label="Rename" icon={<PencilIcon />} onClick={close(onRename)} />
      <ContextMenuItem
        label="Duplicate"
        icon={<CopyIcon />}
        onClick={close(onBulkDuplicate)}
        disabled={duplicateDisabled}
      />
      <ContextMenuItem label="Copy path" icon={<ClipboardIcon />} onClick={close(onCopyPath)} />
      {isDetached ? (
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
      )}
      {projectPath && openInTargets.length > 0 && (
        <div className="group relative">
          <button
            onClick={() => {
              if (primaryTarget) {
                launchOpenInTarget(primaryTarget, projectPath);
                onClose();
              }
            }}
            title={primaryTarget ? `Open in ${primaryTarget.label}` : undefined}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors group-hover:bg-[var(--bg-hover)] group-hover:text-[var(--text-primary)]"
          >
            {primaryTarget && (
              <img src={primaryTarget.icon} alt="" className="h-4 w-4 shrink-0" />
            )}
            <span className="flex-1 truncate">Open with</span>
            <ChevronRightIcon />
          </button>
          <div className="absolute left-full top-0 -ml-px hidden min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg group-hover:block">
            {openInTargets.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  launchOpenInTarget(t, projectPath);
                  onClose();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <img src={t.icon} alt="" className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <ContextMenuSubmenu label="Move to folder" icon={<FolderIcon />}>
        <ContextMenuItem label="New folder…" icon={<FolderIcon />} onClick={close(onCreateGroupWith)} />
        {(groups.length > 0 || currentGroupId) && <ContextMenuSeparator />}
        {groups.map((g) => (
          <ContextMenuItem
            key={g.id}
            label={g.name}
            disabled={g.id === currentGroupId}
            onClick={close(() => onMoveToGroup(g.id))}
          />
        ))}
        {currentGroupId && (
          <ContextMenuItem
            label="Remove from folder"
            onClick={close(() => onMoveToGroup(null))}
          />
        )}
      </ContextMenuSubmenu>
      {canSelect && (
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
    </ContextMenuShell>
  );
}
