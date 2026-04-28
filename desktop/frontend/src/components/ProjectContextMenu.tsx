import { ChevronRightIcon, ClipboardIcon, CopyIcon, PencilIcon, TrashIcon } from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuShell } from "./ui/ContextMenuShell";
import { launchOpenInTarget, useOpenInTargets } from "../hooks/useOpenInTargets";

interface ProjectContextMenuProps {
  x: number;
  y: number;
  busy: boolean;
  canRemove: boolean;
  projectPath: string | null;
  onRename: () => void;
  onDuplicate: () => void;
  onDuplicateExcludeUncommitted: () => void;
  onCopyPath: () => void;
  onRemove: () => void;
  onClose: () => void;
}

export function ProjectContextMenu({
  x,
  y,
  busy,
  canRemove,
  projectPath,
  onRename,
  onDuplicate,
  onDuplicateExcludeUncommitted,
  onCopyPath,
  onRemove,
  onClose,
}: ProjectContextMenuProps) {
  const openInTargets = useOpenInTargets();
  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <ContextMenuShell x={x} y={y} minWidth={180} onClose={onClose}>
      <ContextMenuItem label="Rename" icon={<PencilIcon />} onClick={close(onRename)} />
      <ContextMenuItem
        label="Duplicate project"
        icon={<CopyIcon />}
        onClick={close(onDuplicate)}
        disabled={busy}
      />
      <ContextMenuItem
        label="Duplicate (committed only)"
        icon={<CopyIcon />}
        onClick={close(onDuplicateExcludeUncommitted)}
        disabled={busy}
        title="Duplicate the project and reset the copy to HEAD, discarding staged, unstaged, and untracked changes"
      />
      <ContextMenuItem label="Copy path" icon={<ClipboardIcon />} onClick={close(onCopyPath)} />
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
