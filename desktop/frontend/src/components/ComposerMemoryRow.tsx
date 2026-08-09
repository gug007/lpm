import type { MouseEvent } from "react";
import { Eye } from "lucide-react";
import { relativeTime } from "../relativeTime";
import type { MentionItem } from "../mentions";
import { BrainIcon, SquarePenIcon, TrashIcon } from "./icons";
import { Tooltip } from "./ui/Tooltip";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";

interface ComposerMemoryRowProps {
  session: MentionItem;
  updatedAt?: number;
  // Marks the row the search field's arrow keys are on, so Enter and the mouse
  // agree on which session is next.
  highlighted: boolean;
  onHover: () => void;
  onPick: () => void;
  onView: () => void;
  onRename: () => void;
  onDelete: () => void;
}

// The width the row keeps clear for the actions while they're showing, so a
// long id or title ellipsizes in front of them instead of running underneath.
const ACTIONS_CLEARANCE = "group-hover/row:pr-22 group-focus-within/row:pr-22";
// Held in the layout at zero opacity rather than unmounted: keyboard focus can
// reach them, and they fade rather than pop. Nothing is clickable until the row
// is actually under the pointer, so the hidden set can't swallow a row click.
const ACTIONS_REVEAL =
  "pointer-events-none opacity-0 transition-opacity group-hover/row:pointer-events-auto group-hover/row:opacity-100 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100";
const ACTION_BUTTON =
  "flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-primary)]";

// One saved session in the composer's memory list: picking it writes the
// invocation into the draft, and the hover actions open, rename or remove it.
// Hover state lives on the row rather than on its button so the highlight holds
// while the pointer is over the actions, which overlay the row.
export function ComposerMemoryRow({
  session,
  updatedAt,
  highlighted,
  onHover,
  onPick,
  onView,
  onRename,
  onDelete,
}: ComposerMemoryRowProps) {
  // Keep clicks from pulling focus off the composer editor; the caret stays put
  // so the invocation lands where the user was typing.
  const keepEditorFocus = (e: MouseEvent) => e.preventDefault();

  return (
    <li
      onMouseEnter={onHover}
      className={`group/row relative transition-colors hover:bg-[var(--bg-hover)] ${
        highlighted ? "bg-[var(--bg-hover)]" : ""
      }`}
    >
      <button
        type="button"
        onMouseDown={keepEditorFocus}
        onClick={onPick}
        className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left ${ACTIONS_CLEARANCE}`}
      >
        <span className="shrink-0 text-[var(--text-muted)] transition-colors group-hover/row:text-[var(--accent-cyan)]">
          <BrainIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] leading-[17px] text-[var(--text-secondary)] transition-colors group-hover/row:text-[var(--text-primary)]">
            {session.label}
          </span>
          {session.detail && (
            <span className="block truncate text-[11px] leading-[15px] text-[var(--text-muted)]">
              {session.detail}
            </span>
          )}
        </span>
        {updatedAt !== undefined && (
          <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)] group-hover/row:hidden group-focus-within/row:hidden">
            {relativeTime(updatedAt)}
          </span>
        )}
      </button>
      <span
        className={`absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 ${ACTIONS_REVEAL}`}
      >
        <Tooltip content="Open in Memory" delay={COMPOSER_TOOLTIP_DELAY_MS}>
          <button
            type="button"
            onMouseDown={keepEditorFocus}
            onClick={onView}
            aria-label={`Open ${session.label} in Memory`}
            className={`${ACTION_BUTTON} hover:text-[var(--accent-purple)]`}
          >
            <Eye size={12} />
          </button>
        </Tooltip>
        <Tooltip content="Rename" delay={COMPOSER_TOOLTIP_DELAY_MS}>
          <button
            type="button"
            onMouseDown={keepEditorFocus}
            onClick={onRename}
            aria-label={`Rename ${session.label}`}
            className={`${ACTION_BUTTON} hover:text-[var(--text-primary)]`}
          >
            <SquarePenIcon size={12} />
          </button>
        </Tooltip>
        <Tooltip content="Delete" delay={COMPOSER_TOOLTIP_DELAY_MS}>
          <button
            type="button"
            onMouseDown={keepEditorFocus}
            onClick={onDelete}
            aria-label={`Delete ${session.label}`}
            className={`${ACTION_BUTTON} hover:text-[var(--accent-red)]`}
          >
            <TrashIcon size={12} />
          </button>
        </Tooltip>
      </span>
    </li>
  );
}
