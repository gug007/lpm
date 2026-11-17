import { useState } from "react";
import { InlineNameEditor } from "../InlineNameEditor";
import { SettingsIcon, TrashIcon } from "../icons";

export function TemplateRow({
  name,
  onEditConfig,
  onRename,
  onDelete,
}: {
  name: string;
  onEditConfig: () => void;
  onRename: (oldName: string, newName: string) => Promise<void>;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
      {renaming ? (
        <InlineNameEditor
          initial={name}
          mono
          commitTitle="Save (Esc to cancel)"
          onCommit={(next) => {
            setRenaming(false);
            onRename(name, next).catch(() => {
              // toast surfaced by store
            });
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <>
          <button
            onClick={() => setRenaming(true)}
            className="flex-1 truncate text-left font-mono text-[12px] text-[var(--text-primary)] decoration-[var(--text-muted)] underline-offset-2 hover:underline"
            title="Rename"
          >
            {name}
          </button>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={onEditConfig}
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              title="Edit config"
            >
              <SettingsIcon />
            </button>
            <button
              onClick={onDelete}
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red-text)]"
              title="Delete"
            >
              <TrashIcon />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
