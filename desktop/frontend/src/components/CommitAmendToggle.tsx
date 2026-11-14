import type { HistoryCommit } from "../gitHistory";
import { Tooltip } from "./ui/Tooltip";

interface CommitAmendToggleProps {
  commit: HistoryCommit;
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
}

/** Folds the ticked files and the message into the last commit instead of a
 *  new one. Shown only while that commit isn't pushed. */
export function CommitAmendToggle({ commit, on, disabled, onToggle }: CommitAmendToggleProps) {
  return (
    <Tooltip
      content={`Rewrite “${commit.subject}” (${commit.short}, not pushed): the files you tick are added to it`}
      side="top"
      align="start"
    >
      <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
        <input
          type="checkbox"
          checked={on}
          onChange={onToggle}
          disabled={disabled}
          className="h-3 w-3 accent-[var(--accent-blue)]"
        />
        Amend last commit
      </label>
    </Tooltip>
  );
}
