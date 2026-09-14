import { useEffect, useRef, useState, type FormEvent } from "react";
import { modalInputDefaults } from "../forms/styles";
import type { CustomWorkStatus } from "../types";
import { workStatusNameClash } from "../workStatus";
import { EmojiSlotButton } from "./EmojiPickerButton";
import { SmileIcon } from "./icons";
import { Modal } from "./ui/Modal";
import { SegmentedControl } from "./ui/SegmentedControl";

/** Adding a status, straight onto the row it was opened from, or editing one
 *  of the user's own. */
export type WorkStatusEditor =
  | { kind: "add"; applyTo: string }
  | { kind: "edit"; entry: CustomWorkStatus };

interface WorkStatusEditModalProps {
  editor: WorkStatusEditor | null;
  palette: CustomWorkStatus[];
  onSubmit: (entry: CustomWorkStatus) => void;
  onClose: () => void;
}

const WHEN_APPLIED = [
  { value: "mark", label: "Just the mark" },
  { value: "line", label: "Ask for a line" },
] as const;

/** One status's form: the mark the row will show, its name, and whether
 *  applying it asks for a line. */
export function WorkStatusEditModal({ editor, palette, onSubmit, onClose }: WorkStatusEditModalProps) {
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("");
  const [withNote, setWithNote] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editing = editor?.kind === "edit" ? editor.entry : null;

  useEffect(() => {
    if (!editor) return;
    setLabel(editing?.label ?? "");
    setEmoji(editing?.emoji ?? "");
    setWithNote(editing?.withNote === true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      if (editing) inputRef.current?.select();
    });
  }, [editor]);

  const trimmed = label.trim();
  const clash = workStatusNameClash(palette, trimmed, editing?.label ?? null);
  const clashText =
    clash === "menu"
      ? `The menu already has a status called ${trimmed}.`
      : clash === "yours"
        ? `You already have a status called ${trimmed}.`
        : null;
  const canSubmit = trimmed.length > 0 && emoji.length > 0 && clash === null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ label: trimmed, emoji, withNote });
    onClose();
  };

  return (
    <Modal
      open={editor !== null}
      onClose={onClose}
      zIndexClassName="z-[60]"
      contentClassName="w-[400px] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 shadow-2xl"
    >
      <form onSubmit={handleSubmit} noValidate>
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          {editing ? `Editing ${editing.label}` : "New status"}
        </h3>
        <p className="mt-1.5 text-[12px] leading-snug text-[var(--text-muted)]">
          {editing
            ? "Every project wearing this status follows the change."
            : `Goes on ${editor?.kind === "add" ? editor.applyTo : ""} right away.`}
        </p>
        <div className="relative mt-2">
          <EmojiSlotButton
            inputRef={inputRef}
            value={emoji}
            onSelect={setEmoji}
            placeholder={<SmileIcon />}
          />
          <input
            ref={inputRef}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Name"
            {...modalInputDefaults}
            className="w-full rounded-lg border border-[var(--border)] bg-transparent py-2.5 pl-12 pr-3 text-base text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)]"
          />
        </div>
        {clashText && <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">{clashText}</p>}
        <p className="mt-4 text-[12px] text-[var(--text-secondary)]">When applied</p>
        <SegmentedControl
          className="mt-1.5 w-fit"
          variant="subtle"
          ariaLabel="When applied"
          value={withNote ? "line" : "mark"}
          options={WHEN_APPLIED}
          onChange={(v) => setWithNote(v === "line")}
        />
        <p className="mt-1.5 text-[12px] leading-snug text-[var(--text-muted)]">
          The line shows under the name in the sidebar, the way Blocked's reason does.
        </p>
        <div className="mt-4 flex items-center justify-end gap-1">
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
            {editing ? "Save" : "Add and apply"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
