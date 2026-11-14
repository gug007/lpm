import type { HistoryCommit } from "../gitHistory";
import { relativeAgo } from "../relativeTime";
import { CommitCiIcon } from "./CommitCiIcon";
import { UndoIcon } from "./icons";

interface BranchCommitRowProps {
  commit: HistoryCommit;
  latest: boolean;
  onOpen: (commit: HistoryCommit) => void;
  onUndo?: (commit: HistoryCommit) => void;
}

/** One commit in the branch's hover card, marked on the right if it isn't
 *  pushed yet. Clicking it opens the commit in History. */
export function BranchCommitRow({ commit, latest, onOpen, onUndo }: BranchCommitRowProps) {
  return (
    <span className="group/row relative flex min-w-0 items-center">
      <button
        type="button"
        onClick={() => onOpen(commit)}
        title="Open in History"
        className="-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1 text-left transition-colors hover:bg-[var(--bg-hover)]"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={`truncate text-[12px] ${latest ? "font-semibold" : "text-[var(--text-secondary)]"}`}>
            {commit.subject}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <span className="font-mono">{commit.short}</span>
            <span>·</span>
            <span className="tabular-nums">{relativeAgo(commit.time)}</span>
          </span>
        </span>
        {commit.unpushed && !onUndo && <CommitCiIcon mark="unpushed" size={14} />}
      </button>
      {onUndo && (
        <button
          type="button"
          onClick={() => onUndo(commit)}
          title="Take this commit back. Its changes and message return to Commit."
          className="ml-2 flex shrink-0 items-center gap-1 rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] [&>svg]:h-3 [&>svg]:w-3"
        >
          <UndoIcon />
          Undo commit
        </button>
      )}
    </span>
  );
}
