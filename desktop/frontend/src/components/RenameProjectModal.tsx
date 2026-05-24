import { useEffect, useRef, useState } from "react";
import { Modal } from "./ui/Modal";
import { EmojiPickerButton } from "./EmojiPickerButton";
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    });
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
        <div className="relative mt-2">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            {...modalInputDefaults}
            className="w-full rounded-lg border border-[var(--border)] bg-transparent py-2.5 pl-3 pr-10 text-base text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)]"
          />
          <EmojiPickerButton inputRef={inputRef} value={value} onChange={setValue} />
        </div>

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
