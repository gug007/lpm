import { ChevronRightIcon, ClipboardIcon, CopyIcon, DetachIcon, PencilIcon, RefreshIcon, TrashIcon } from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuShell } from "./ui/ContextMenuShell";
import { launchOpenInTarget, primaryOpenInTarget, useOpenInTargets } from "../hooks/useOpenInTargets";

interface ProjectContextMenuProps {
  x: number;
  y: number;
  busy: boolean;
  canRemove: boolean;
  isDetached: boolean;
  projectPath: string | null;
  onRename: () => void;
  onDuplicate: (excludeUncommitted: boolean, reinstallDeps: boolean) => void;
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
  onCopyPath,
  onDetach,
  onAttach,
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
      <div className="group relative">
        <button
          onClick={close(() => onDuplicate(false, false))}
          disabled={busy}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors group-hover:bg-[var(--bg-hover)] group-hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="flex shrink-0 items-center">
            <CopyIcon />
          </span>
          <span className="flex-1 truncate">Duplicate</span>
          <ChevronRightIcon />
        </button>
        <div className="absolute left-full top-0 -ml-px hidden w-[280px] rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg group-hover:block">
          <ContextMenuItem
            label="Duplicate project"
            description="Copy everything, including installed dependencies"
            icon={<CopyIcon />}
            onClick={close(() => onDuplicate(false, false))}
            disabled={busy}
          />
          <ContextMenuItem
            label="Duplicate, reinstall dependencies"
            description="Copy without dependencies, then install them fresh"
            icon={<RefreshIcon />}
            onClick={close(() => onDuplicate(false, true))}
            disabled={busy}
          />
          <div className="my-1 border-t border-[var(--border)]" />
          <ContextMenuItem
            label="Committed changes only"
            description="Reset the copy to the last commit, keeping dependencies"
            icon={<CopyIcon />}
            onClick={close(() => onDuplicate(true, false))}
            disabled={busy}
          />
          <ContextMenuItem
            label="Committed only, reinstall dependencies"
            description="Reset to the last commit, copy without dependencies, then install fresh"
            icon={<RefreshIcon />}
            onClick={close(() => onDuplicate(true, true))}
            disabled={busy}
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
