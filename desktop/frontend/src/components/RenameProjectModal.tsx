import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EmojiPicker } from "frimousse";
import { Modal } from "./ui/Modal";
import { SmileIcon } from "./icons";
import { useEventListener } from "../hooks/useEventListener";
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
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPos, setPickerPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    setShowPicker(false);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    });
  }, [open, initialValue]);

  useLayoutEffect(() => {
    if (!showPicker) {
      setPickerPos(null);
      return;
    }
    const update = () => {
      const el = inputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPickerPos({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [showPicker]);

  useEventListener(
    "mousedown",
    (e) => {
      const target = e.target as Node;
      if (pickerRef.current?.contains(target)) return;
      if (toggleRef.current?.contains(target)) return;
      if (inputRef.current?.contains(target)) return;
      setShowPicker(false);
    },
    document,
    showPicker,
  );

  // Capture-phase Escape so the picker closes first instead of the modal.
  useEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setShowPicker(false);
      inputRef.current?.focus();
    },
    document,
    showPicker,
    true,
  );

  const trimmed = value.trim();
  const canSubmit = trimmed !== initialValue.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(trimmed);
    onClose();
  };

  const insertEmoji = (emoji: string) => {
    const input = inputRef.current;
    const selStart = input?.selectionStart ?? null;
    const selEnd = input?.selectionEnd ?? null;
    // The initial focus selects everything; treat that as "append" so the
    // first emoji click doesn't wipe the existing name.
    const allSelected =
      selStart === 0 && selEnd === value.length && value.length > 0;
    const start =
      allSelected || selStart === null ? value.length : selStart;
    const end = allSelected || selEnd === null ? value.length : selEnd;
    const next = value.slice(0, start) + emoji + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      const cursor = start + emoji.length;
      el.setSelectionRange(cursor, cursor);
    });
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
          <button
            ref={toggleRef}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowPicker((v) => !v)}
            aria-label="Insert emoji"
            aria-pressed={showPicker}
            className={`absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${showPicker ? "bg-[var(--bg-hover)] text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
          >
            <SmileIcon size={16} />
          </button>
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
      {open && showPicker && pickerPos &&
        createPortal(
          <div
            ref={pickerRef}
            style={{
              position: "fixed",
              top: pickerPos.top,
              left: pickerPos.left,
              width: pickerPos.width,
            }}
            className="z-[70] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl"
          >
            <EmojiPicker.Root
              className="isolate flex h-[300px] w-full flex-col"
              columns={8}
              onEmojiSelect={({ emoji }) => insertEmoji(emoji)}
            >
              <EmojiPicker.Search
                autoFocus
                className="mx-2 mt-2 appearance-none rounded-md border border-transparent bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--text-muted)]"
              />
              <EmojiPicker.Viewport className="relative flex-1 outline-none">
                <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-[11px] text-[var(--text-muted)]">
                  Loading…
                </EmojiPicker.Loading>
                <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-[11px] text-[var(--text-muted)]">
                  No matches
                </EmojiPicker.Empty>
                <EmojiPicker.List
                  className="select-none pb-1.5"
                  components={{
                    CategoryHeader: ({ category, ...props }) => (
                      <div
                        {...props}
                        className="bg-[var(--bg-secondary)] px-3 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]"
                      >
                        {category.label}
                      </div>
                    ),
                    Row: ({ children, ...props }) => (
                      <div
                        {...props}
                        className="scroll-my-1 gap-0.5 px-1.5"
                      >
                        {children}
                      </div>
                    ),
                    Emoji: ({ emoji, onPointerDown, ...props }) => (
                      <button
                        {...props}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          onPointerDown?.(e);
                        }}
                        className="flex aspect-square flex-1 items-center justify-center rounded-md text-xl transition-colors data-[active]:bg-[var(--bg-hover)]"
                      >
                        {emoji.emoji}
                      </button>
                    ),
                  }}
                />
              </EmojiPicker.Viewport>
            </EmojiPicker.Root>
          </div>,
          document.body,
        )}
    </Modal>
  );
}
