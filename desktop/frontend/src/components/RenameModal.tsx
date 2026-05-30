import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "./ui/Modal";
import { EmojiPickerButton, EmojiSlotButton } from "./EmojiPickerButton";
import { TerminalIcon } from "./icons";
import { modalInputDefaults } from "../forms/styles";

interface RenameModalProps {
  open: boolean;
  title: string;
  initialValue: string;
  // When true, shows a leading emoji slot (like the action editor) instead of
  // the trailing insert-into-text picker, and reports the emoji via onSubmit.
  withEmoji?: boolean;
  initialEmoji?: string;
  onClose: () => void;
  onSubmit: (value: string, emoji?: string) => void;
}

export function RenameModal({
  open,
  title,
  initialValue,
  withEmoji = false,
  initialEmoji = "",
  onClose,
  onSubmit,
}: RenameModalProps) {
  const [value, setValue] = useState(initialValue);
  const [emoji, setEmoji] = useState(initialEmoji);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    setEmoji(initialEmoji);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    });
  }, [open, initialValue, initialEmoji]);

  const trimmed = value.trim();
  const canSubmit =
    trimmed.length > 0 &&
    (trimmed !== initialValue.trim() || emoji !== initialEmoji);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(trimmed, withEmoji ? emoji : undefined);
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
          {title}
        </h3>
        <div className="relative mt-2">
          {withEmoji && (
            <EmojiSlotButton
              inputRef={inputRef}
              value={emoji}
              onSelect={setEmoji}
              placeholder={<TerminalIcon />}
            />
          )}
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            {...modalInputDefaults}
            className={`w-full rounded-lg border border-[var(--border)] bg-transparent py-2.5 text-base text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)] ${
              withEmoji ? "pl-12 pr-3" : "pl-3 pr-10"
            }`}
          />
          {!withEmoji && (
            <EmojiPickerButton inputRef={inputRef} value={value} onChange={setValue} />
          )}
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
