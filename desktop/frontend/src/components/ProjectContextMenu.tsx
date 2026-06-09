import { ChevronRightIcon, ClipboardIcon, CopyIcon, DetachIcon, PencilIcon, RefreshIcon, TrashIcon } from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuShell } from "./ui/ContextMenuShell";
import { launchOpenInTarget, useOpenInTargets } from "../hooks/useOpenInTargets";

interface ProjectContextMenuProps {
  x: number;
  y: number;
  busy: boolean;
  canRemove: boolean;
  isDetached: boolean;
  projectPath: string | null;
  onRename: () => void;
  onDuplicate: () => void;
  onDuplicateExcludeUncommitted: () => void;
  onReinstallDeps: () => void;
  onCopyPath: () => void;
  onDetach: () => void;
  onAttach: () => void;
  onRemove: () => void;
  onClose: () => void;
}

export function ProjectContextMenu({
  x,
  y,
  busy,
  canRemove,
  isDetached,
  projectPath,
  onRename,
  onDuplicate,
  onDuplicateExcludeUncommitted,
  onReinstallDeps,
  onCopyPath,
  onDetach,
  onAttach,
  onRemove,
  onClose,
}: ProjectContextMenuProps) {
  const openInTargets = useOpenInTargets().filter((t) => !t.fileOnly);
  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <ContextMenuShell x={x} y={y} minWidth={180} onClose={onClose}>
      <ContextMenuItem label="Rename" icon={<PencilIcon />} onClick={close(onRename)} />
      <div className="group relative">
        <button
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors group-hover:bg-[var(--bg-hover)] group-hover:text-[var(--text-primary)]"
        >
          <span className="flex shrink-0 items-center">
            <CopyIcon />
          </span>
          <span className="flex-1 truncate">Duplicate</span>
          <ChevronRightIcon />
        </button>
        <div className="absolute left-full top-0 -ml-px hidden min-w-[200px] rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg group-hover:block">
          <ContextMenuItem
            label="Duplicate project"
            icon={<CopyIcon />}
            onClick={close(onDuplicate)}
            disabled={busy}
            title="Copy the project as-is, including installed dependencies"
          />
          <ContextMenuItem
            label="Committed changes only"
            icon={<CopyIcon />}
            onClick={close(onDuplicateExcludeUncommitted)}
            disabled={busy}
            title="Duplicate the project and reset the copy to HEAD, discarding staged, unstaged, and untracked changes"
          />
          <ContextMenuItem
            label="Reinstall dependencies"
            icon={<RefreshIcon />}
            onClick={close(onReinstallDeps)}
            disabled={busy}
            title="Copy the project without its installed packages, then install them fresh with the project's package manager"
          />
        </div>
      </div>
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
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors group-hover:bg-[var(--bg-hover)] group-hover:text-[var(--text-primary)]"
          >
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
      {canRemove && (
        <>
          <div className="my-1 border-t border-[var(--border)]" />
          <ContextMenuItem
            destructive
            label="Remove duplicate"
            icon={<TrashIcon />}
            onClick={close(onRemove)}
            disabled={busy}
          />
        </>
      )}
    </ContextMenuShell>
  );
}
