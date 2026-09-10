import { CheckIcon, PencilIcon, XIcon } from "./icons";
import { WorkStatusEmoji } from "./WorkStatusEmoji";

interface WorkStatusMenuRowProps {
  label: string;
  emoji: string;
  current: boolean;
  // Applying it opens the line dialog first; the row says so in a word.
  asks: boolean;
  onPick: () => void;
  // Present on the statuses the user may change; the built-in three have none.
  actions?: { onEdit: () => void; onRemove: () => void };
}

const AUX_BUTTON =
  "flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]";

/** A Status row: the pick is the row itself, a muted "asks" at its end warns
 *  of the dialog the way a shortcut sits on other rows, and a status the user
 *  may change shows edit and remove at its right edge on hover. Those two
 *  overlay the edge rather than reserving it, so every row's end lines up at
 *  rest and only the hovered row slides its word clear. The room they need is
 *  reserved instead in the gap between the name and the word, so the widest
 *  row already sizes the panel for its hovered state and nothing resizes. The
 *  menu's arrow keys skip the two buttons, so a row stays one stop. */
export function WorkStatusMenuRow({
  label,
  emoji,
  current,
  asks,
  onPick,
  actions,
}: WorkStatusMenuRowProps) {
  return (
    <div className="group relative flex items-center text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-within:bg-[var(--bg-hover)] focus-within:text-[var(--text-primary)]">
      <button
        type="button"
        onClick={onPick}
        className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-3 pr-3 text-left outline-none ${
          actions ? "group-hover:pr-14 group-focus-within:pr-14" : ""
        }`}
      >
        <span className="flex shrink-0 items-center">
          <WorkStatusEmoji emoji={emoji} />
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span
          aria-hidden="true"
          className={`w-11 shrink-0 ${actions ? "group-hover:w-0 group-focus-within:w-0" : ""}`}
        />
        {asks && <span className="shrink-0 text-[10px] text-[var(--text-muted)]">asks</span>}
        {current && (
          <span className="flex shrink-0 items-center text-[var(--text-muted)]">
            <CheckIcon />
          </span>
        )}
      </button>
      {actions && (
        <span className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
          <button
            type="button"
            tabIndex={-1}
            data-menu-aux=""
            aria-label={`Edit ${label}`}
            onClick={actions.onEdit}
            className={AUX_BUTTON}
          >
            <PencilIcon size={12} />
          </button>
          <button
            type="button"
            tabIndex={-1}
            data-menu-aux=""
            aria-label={`Remove ${label}`}
            onClick={actions.onRemove}
            className={AUX_BUTTON}
          >
            <XIcon />
          </button>
        </span>
      )}
    </div>
  );
}
