import { useEffect } from "react";
import { AttachIcon, ChevronRightIcon, ClipboardIcon, CopyIcon, DetachIcon, PencilIcon, TrashIcon } from "./icons";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { launchOpenInTarget, useOpenInTargets } from "../hooks/useOpenInTargets";

interface ProjectContextMenuProps {
  x: number;
  y: number;
  busy: boolean;
  canRemove: boolean;
  isDetached: boolean;
  projectPath: string | null;
  onRename: () => void;
  onToggleDetached: () => void;
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
  isDetached,
  projectPath,
  onRename,
  onToggleDetached,
  onDuplicate,
  onDuplicateExcludeUncommitted,
  onCopyPath,
  onRemove,
  onClose,
}: ProjectContextMenuProps) {
  const ref = useOutsideClick<HTMLDivElement>(onClose);
  const openInTargets = useOpenInTargets();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg"
      style={{ left: x, top: y }}
    >
      <button
        onClick={() => {
          onRename();
          onClose();
        }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <span className="flex-1 truncate">Rename</span>
        <PencilIcon />
      </button>
      <button
        onClick={() => {
          onToggleDetached();
          onClose();
        }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <span className="flex-1 truncate">{isDetached ? "Attach to main window" : "Detach to new window"}</span>
        {isDetached ? <AttachIcon /> : <DetachIcon />}
      </button>
      <button
        onClick={() => {
          onDuplicate();
          onClose();
        }}
        disabled={busy}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex-1 truncate">Duplicate project</span>
        <CopyIcon />
      </button>
      <button
        onClick={() => {
          onDuplicateExcludeUncommitted();
          onClose();
        }}
        disabled={busy}
        title="Duplicate the project and reset the copy to HEAD, discarding staged, unstaged, and untracked changes"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex-1 truncate">Duplicate (committed only)</span>
        <CopyIcon />
      </button>
      <button
        onClick={() => {
          onCopyPath();
          onClose();
        }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <span className="flex-1 truncate">Copy path</span>
        <ClipboardIcon />
      </button>
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
          <button
            onClick={() => {
              onRemove();
              onClose();
            }}
            disabled={busy}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--accent-red)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex-1 truncate">Remove duplicate</span>
            <TrashIcon />
          </button>
        </>
      )}
    </div>
  );
}
