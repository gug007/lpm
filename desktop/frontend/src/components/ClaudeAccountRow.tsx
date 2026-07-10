import { useState } from "react";
import { toast } from "sonner";
import { CopyIcon, TrashIcon } from "./icons";
import { InlineNameEditor } from "./InlineNameEditor";

interface ClaudeAccountRowProps {
  id: string;
  label: string;
  onRename: (label: string) => void;
  onDelete: () => void;
}

export function ClaudeAccountRow({ id, label, onRename, onDelete }: ClaudeAccountRowProps) {
  const [renaming, setRenaming] = useState(false);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success("Account id copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
      {renaming ? (
        <InlineNameEditor
          initial={label}
          commitTitle="Save (Esc to cancel)"
          onCommit={(next) => {
            setRenaming(false);
            onRename(next);
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <>
          <button
            onClick={() => setRenaming(true)}
            className="min-w-0 flex-1 truncate text-left text-[13px] text-[var(--text-primary)] hover:text-[var(--accent-cyan)]"
            title="Rename"
          >
            {label}
          </button>
          <button
            onClick={copyId}
            className="group flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--bg-secondary)] px-2 py-1 font-mono text-[10px] tracking-wide text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
            title={`Copy account id — ${id}`}
          >
            {id.slice(0, 8)}
            <span className="opacity-0 transition-opacity group-hover:opacity-100">
              <CopyIcon size={11} />
            </span>
          </button>
          <button
            onClick={onDelete}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-red-400"
            title="Remove"
          >
            <TrashIcon />
          </button>
        </>
      )}
    </div>
  );
}
