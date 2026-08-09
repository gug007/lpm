import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "./ui/Modal";

interface MemoryRenameDialogProps {
  open: boolean;
  // The session's current id, and every other id in the same memory folder —
  // taken names are caught here rather than after a round trip to disk.
  currentName: string;
  taken: string[];
  // Raise above a host popover, the way the delete confirmation does.
  zIndexClassName?: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}

// Lowercase, dashes for anything else, and no leading dash — the shape the
// backend accepts. A trailing dash survives so "auth-" keeps typing into
// "auth-refactor" instead of collapsing under the user's fingers.
export const normalizeSessionName = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 64);

// Renames a memory session — the id agents continue the work by. Shared by the
// Memory tab and the composer's memory list so both offer the same rules and
// the same wording.
export function MemoryRenameDialog({
  open,
  currentName,
  taken,
  zIndexClassName,
  onCancel,
  onSubmit,
}: MemoryRenameDialogProps) {
  const [value, setValue] = useState(currentName);

  useEffect(() => {
    if (open) setValue(currentName);
  }, [open, currentName]);

  const name = normalizeSessionName(value);
  const collides = name !== currentName && taken.includes(name);
  const canSubmit = name.length > 0 && name !== currentName && !collides;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canSubmit) onSubmit(name);
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      zIndexClassName={zIndexClassName}
      contentClassName="w-80 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 shadow-xl"
    >
      <form onSubmit={submit} noValidate>
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Rename session</h3>
        <p className="mt-1.5 text-[12px] leading-snug text-[var(--text-muted)]">
          This is the name agents continue the work by. Notes already written stay as they are.
        </p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Session name"
          className="mt-3 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-cyan)]"
        />
        {collides && (
          <p className="mt-1.5 text-[11px] text-[var(--accent-red)]">
            {name} is already taken by another session.
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85 disabled:opacity-40"
          >
            Rename
          </button>
        </div>
      </form>
    </Modal>
  );
}
