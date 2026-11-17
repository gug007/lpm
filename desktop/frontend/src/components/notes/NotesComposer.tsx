import { useState, type ClipboardEvent, type RefObject } from "react";
import { useAutoGrowTextarea } from "../../hooks/useAutoGrowTextarea";
import { enterHint } from "../../shortcutHints";
import { PaperclipIcon, SendIcon } from "../icons";
import { BTN_PRIMARY, ICON_ACTION } from "../ui/buttons";
import { CARD_CLASS } from "../ui/fields";
import { Tooltip } from "../ui/Tooltip";
import { TEXTAREA_MAX_HEIGHT_PX, formatSize } from "./notesFormat";

export interface PendingAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  data: Uint8Array;
}

interface NotesComposerProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  pending: PendingAttachment[];
  onRemovePending: (id: string) => void;
  onAddFiles: (files: FileList) => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  // Sends the note; `sent` empties the field once it has landed.
  onSend: (text: string, sent: () => void) => void;
  placeholder: string;
  // No chat to write into yet.
  disabled: boolean;
  // A chat to send to and no send already under way.
  ready: boolean;
}

// The box under the notes: attachments waiting to go, the field, and its
// attach and send buttons. It keeps the draft's text itself, so typing
// re-renders only this box.
export function NotesComposer({
  textareaRef,
  fileInputRef,
  pending,
  onRemovePending,
  onAddFiles,
  onPaste,
  onSend,
  placeholder,
  disabled,
  ready,
}: NotesComposerProps) {
  const [text, setText] = useState("");
  useAutoGrowTextarea(textareaRef, text, TEXTAREA_MAX_HEIGHT_PX);
  const canSend = ready && (text.trim().length > 0 || pending.length > 0);
  const send = () => {
    if (canSend) onSend(text, () => setText(""));
  };

  return (
    <div className={`${CARD_CLASS} transition-colors focus-within:border-[var(--text-muted)]`}>
      {pending.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] px-3 py-2">
          {pending.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-1.5 rounded-md bg-[var(--bg-hover)] px-2 py-1 text-[12px] text-[var(--text-secondary)]"
            >
              <PaperclipIcon />
              <span className="max-w-[160px] truncate">{p.name}</span>
              <span className="text-[11px] text-[var(--text-muted)]">{formatSize(p.size)}</span>
              <button
                onClick={() => onRemovePending(p.id)}
                className="ml-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                aria-label={`Remove ${p.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        onPaste={onPaste}
        placeholder={placeholder}
        rows={1}
        disabled={disabled}
        className="w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-sm outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60"
        style={{ minHeight: 44, maxHeight: TEXTAREA_MAX_HEIGHT_PX }}
      />
      <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
        <Tooltip content="Attach files" side="top">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className={ICON_ACTION}
            aria-label="Attach files"
          >
            <PaperclipIcon />
          </button>
        </Tooltip>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) onAddFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="hidden text-[12px] text-[var(--text-muted)] sm:inline">
            <kbd className="font-sans">{enterHint()}</kbd> send · <kbd className="font-sans">{enterHint({ shift: true })}</kbd> new
            line · Markdown
          </span>
          <button
            onClick={send}
            disabled={!canSend}
            className={`${BTN_PRIMARY} flex h-7 items-center gap-1.5`}
            aria-label="Send note"
          >
            <SendIcon />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
