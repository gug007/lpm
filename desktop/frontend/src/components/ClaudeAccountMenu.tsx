import { useState } from "react";
import { Ellipsis } from "lucide-react";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuShell } from "./ui/ContextMenuShell";

interface ClaudeAccountMenuProps {
  label: string;
  onRename: () => void;
  onCopyId: () => void;
  onRemove: () => void;
}

/** The ⋯ menu on an added Claude account. */
export function ClaudeAccountMenu({ label, onRename, onCopyId, onRemove }: ClaudeAccountMenuProps) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const close = () => setAt(null);
  const pick = (fn: () => void) => () => {
    close();
    fn();
  };

  return (
    <>
      <button
        type="button"
        aria-label={`More for ${label}`}
        aria-haspopup="menu"
        aria-expanded={at !== null}
        // The menu closes itself on an outside mousedown; let this click do it instead.
        onMouseDown={(e) => {
          if (at) e.stopPropagation();
        }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setAt(at ? null : { x: rect.right, y: rect.bottom + 4 });
        }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]"
      >
        <Ellipsis size={14} />
      </button>
      {at && (
        <ContextMenuShell x={at.x} y={at.y} align="end" onClose={close}>
          <ContextMenuItem label="Rename" onClick={pick(onRename)} />
          <ContextMenuItem label="Copy account id" onClick={pick(onCopyId)} />
          <ContextMenuSeparator />
          <ContextMenuItem label="Remove…" destructive onClick={pick(onRemove)} />
        </ContextMenuShell>
      )}
    </>
  );
}
