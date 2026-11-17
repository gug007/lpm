import { memo, useRef, useState } from "react";
import type { notes } from "../../../bridge/models";
import { useAutoGrowTextarea } from "../../hooks/useAutoGrowTextarea";
import { enterHint } from "../../shortcutHints";
import { PencilIcon, TrashIcon } from "../icons";
import { MessageMarkdown } from "../MessageMarkdown";
import { BTN_PRIMARY, BTN_SECONDARY, ICON_ACTION, ICON_ACTION_DANGER } from "../ui/buttons";
import { NoteAttachment } from "./NoteAttachment";
import { TEXTAREA_MAX_HEIGHT_PX, formatTime } from "./notesFormat";

interface NoteRowProps {
  message: notes.Message;
  projectName: string;
  highlight: boolean;
  onSave: (id: string, chatID: string, text: string) => void;
  onDelete: (id: string, chatID: string) => void;
}

// One note: its time in a fixed column so the text lines up, the note, and
// Edit / Delete over its corner on hover.
export const NoteRow = memo(function NoteRow({
  message,
  projectName,
  highlight,
  onSave,
  onDelete,
}: NoteRowProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  useAutoGrowTextarea(editRef, draft ?? "", TEXTAREA_MAX_HEIGHT_PX);

  const cancel = () => setDraft(null);
  const save = () => {
    if (draft === null) return;
    if (draft !== message.text) onSave(message.id, message.chatId, draft);
    setDraft(null);
  };

  return (
    <div
      data-msg-id={message.id}
      className={`group relative flex items-baseline gap-3 rounded-lg px-3 py-2 transition-colors duration-700 ${
        highlight ? "bg-[var(--accent-amber)]/10" : "hover:bg-[var(--bg-hover)]/60"
      }`}
    >
      <span className="w-[64px] shrink-0 text-[12px] tabular-nums text-[var(--text-muted)]">
        {formatTime(message.ts)}
        {message.editedAt && <span className="block">edited</span>}
      </span>
      <div className="min-w-0 max-w-[720px] flex-1">
        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              ref={editRef}
              autoFocus
              value={draft ?? ""}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
                if (e.key === "Escape") cancel();
              }}
              className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm outline-none focus:border-[var(--text-muted)]"
              rows={1}
              style={{ maxHeight: TEXTAREA_MAX_HEIGHT_PX }}
            />
            <div className="flex items-center gap-2">
              <button onClick={save} className={BTN_PRIMARY}>
                Save
              </button>
              <button onClick={cancel} className={BTN_SECONDARY}>
                Cancel
              </button>
              <span className="ml-auto text-[11px] text-[var(--text-muted)]">
                {enterHint({ meta: true })} save · Esc cancel
              </span>
            </div>
          </div>
        ) : (
          <MessageMarkdown text={message.text} />
        )}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((att: notes.Attachment) => (
              <NoteAttachment key={att.hash} projectName={projectName} attachment={att} />
            ))}
          </div>
        )}
      </div>
      {!editing && (
        <div className="pointer-events-none absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-0.5 opacity-0 shadow-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
          <button
            onClick={() => setDraft(message.text)}
            className={ICON_ACTION}
            aria-label="Edit note"
            title="Edit"
          >
            <PencilIcon />
          </button>
          <button
            onClick={() => onDelete(message.id, message.chatId)}
            className={ICON_ACTION_DANGER}
            aria-label="Delete note"
            title="Delete"
          >
            <TrashIcon />
          </button>
        </div>
      )}
    </div>
  );
});
