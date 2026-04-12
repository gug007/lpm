import { useEffect } from "react";
import { ClipboardIcon, CopyIcon, PencilIcon, TrashIcon } from "./icons";
import { useOutsideClick } from "../hooks/useOutsideClick";

interface ProjectContextMenuProps {
  x: number;
  y: number;
  busy: boolean;
  canRemove: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onCopyPath: () => void;
  onRemove: () => void;
  onClose: () => void;
}

export function ProjectContextMenu({
  x,
  y,
  busy,
  canRemove,
  onRename,
  onDuplicate,
  onCopyPath,
  onRemove,
  onClose,
}: ProjectContextMenuProps) {
  const ref = useOutsideClick<HTMLDivElement>(onClose);

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
          onCopyPath();
          onClose();
        }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <span className="flex-1 truncate">Copy path</span>
        <ClipboardIcon />
      </button>
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
