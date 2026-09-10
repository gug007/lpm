import { CheckIcon, PencilIcon, XIcon } from "./icons";
import { WorkStatusEmoji } from "./WorkStatusEmoji";

interface WorkStatusMenuRowProps {
  label: string;
  emoji: string;
  current: boolean;
  onPick: () => void;
  // Present on the statuses the user may change; the built-in three have none.
  actions?: { onEdit: () => void; onRemove: () => void };
}

const AUX_BUTTON =
  "flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]";

/** A Status row: the pick is the row itself, and a status the user may
 *  change shows edit and remove at its right edge on hover. The menu's arrow
 *  keys skip those two, so a row stays one stop. */
export function WorkStatusMenuRow({ label, emoji, current, onPick, actions }: WorkStatusMenuRowProps) {
  return (
    <div className="group flex items-center text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-within:bg-[var(--bg-hover)] focus-within:text-[var(--text-primary)]">
      <button
        type="button"
        onClick={onPick}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-3 pr-3 text-left outline-none"
      >
        <span className="flex shrink-0 items-center">
          <WorkStatusEmoji emoji={emoji} />
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {current && (
          <span className="flex shrink-0 items-center text-[var(--text-muted)]">
            <CheckIcon />
          </span>
        )}
      </button>
      {actions && (
        <span className="mr-2 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
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
