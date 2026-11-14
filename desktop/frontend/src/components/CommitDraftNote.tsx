import { relativeAgo } from "../relativeTime";

interface CommitDraftNoteProps {
  savedAt: number;
  disabled: boolean;
  onClear: () => void;
}

/** Under the message: it's the draft left here last time, and how to drop it. */
export function CommitDraftNote({ savedAt, disabled, onClear }: CommitDraftNoteProps) {
  return (
    <div className="-mt-2 flex items-center gap-1.5 px-1 text-[11px] text-[var(--text-muted)]">
      <span>Draft from {relativeAgo(Math.floor(savedAt / 1000))}</span>
      <span aria-hidden>·</span>
      <button
        type="button"
        onClick={onClear}
        disabled={disabled}
        className="rounded px-0.5 font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
      >
        Clear
      </button>
    </div>
  );
}
