import { useComposerStore } from "../store/composer";
import { MessageIcon } from "./icons";

interface ComposerReopenBarProps {
  // Terminal the input would target; mirrors the composer's own placeholder so
  // the collapsed bar reads as the same input, just folded away.
  targetLabel: string;
}

// Shown in the composer's slot when the shared input is closed: a slim, inert
// stand-in for the field that reopens it on click (same as ⌘I). Sits per-pane so
// wherever a terminal is, its input is one click away.
export function ComposerReopenBar({ targetLabel }: ComposerReopenBarProps) {
  return (
    <div className="border-t border-[var(--border)] bg-[var(--terminal-bg)] px-3 py-1.5">
      <button
        type="button"
        onClick={() => useComposerStore.getState().setOpen(true)}
        title="Show input (⌘I)"
        aria-label={`Show message input for ${targetLabel}`}
        className="group flex w-full items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-left text-[13px] text-[var(--text-muted)] transition-colors hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        <span className="flex shrink-0 items-center opacity-70 transition-opacity group-hover:opacity-100">
          <MessageIcon />
        </span>
        <span className="min-w-0 flex-1 truncate">Send to {targetLabel}…</span>
        <span className="shrink-0 font-mono text-[11px] opacity-60 transition-opacity group-hover:opacity-100">
          ⌘I
        </span>
      </button>
    </div>
  );
}
