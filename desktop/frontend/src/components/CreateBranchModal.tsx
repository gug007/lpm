import { useEffect, useRef, useState } from "react";
import { Modal } from "./ui/Modal";
import { XIcon } from "./icons";

interface CreateBranchModalProps {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void> | void;
}

export function CreateBranchModal({ open, busy, onClose, onCreate }: CreateBranchModalProps) {
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    nameRef.current?.focus();
  }, [open]);

  const canCreate = !busy && name.trim().length > 0;

  const submit = async () => {
    if (!canCreate) return;
    await onCreate(name.trim());
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      zIndexClassName="z-[60]"
      contentClassName="w-[440px] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 shadow-xl"
    >
      <div className="flex items-start justify-between">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          Create and checkout branch
        </h3>
        <button
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          className="-mr-1 -mt-1 rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          <XIcon />
        </button>
      </div>

      <div className="mt-5">
        <label className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">
          Branch name
        </label>
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="new-branch"
          disabled={busy}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--text-muted)] disabled:opacity-60"
        />
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onClose}
          disabled={busy}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
        >
          Close
        </button>
        <button
          onClick={submit}
          disabled={!canCreate}
          className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Creating\u2026" : "Create and checkout"}
        </button>
      </div>
    </Modal>
  );
}
