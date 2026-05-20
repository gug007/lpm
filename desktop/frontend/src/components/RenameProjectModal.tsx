import { useEffect, useState } from "react";
import { Modal } from "./ui/Modal";
import { modalInputDefaults } from "../forms/styles";

interface RenameProjectModalProps {
  open: boolean;
  initialValue: string;
  onClose: () => void;
  onSubmit: (value: string) => void;
}

export function RenameProjectModal({
  open,
  initialValue,
  onClose,
  onSubmit,
}: RenameProjectModalProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  const trimmed = value.trim();
  const canSubmit = trimmed !== initialValue.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(trimmed);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      zIndexClassName="z-[60]"
      contentClassName="w-[380px] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 shadow-2xl"
    >
      <form onSubmit={handleSubmit} noValidate>
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Rename project
        </h3>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          {...modalInputDefaults}
          className="mt-2 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2.5 text-base text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)]"
        />
        <div className="mt-5 flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-[var(--text-primary)] px-4 py-1.5 text-sm font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85 disabled:opacity-30"
          >
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
