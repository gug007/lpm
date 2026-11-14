import type { HistoryCommit } from "../gitHistory";
import { BranchCommitRow } from "./BranchCommitRow";
import { HistoryIcon } from "./icons";

interface BranchCommitCardProps {
  commits: HistoryCommit[];
  onOpen: (commit: HistoryCommit) => void;
  onViewHistory: () => void;
  /** Set while the newest commit can still be taken back. */
  onUndo?: (commit: HistoryCommit) => void;
}

/** What resting on the branch button shows: its last commits. */
export function BranchCommitCard({ commits, onOpen, onViewHistory, onUndo }: BranchCommitCardProps) {
  return (
    <span className="flex w-[340px] max-w-full flex-col gap-1 leading-snug">
      {commits.map((commit, i) => (
        <BranchCommitRow
          key={commit.hash}
          commit={commit}
          latest={i === 0}
          onOpen={onOpen}
          onUndo={i === 0 ? onUndo : undefined}
        />
      ))}
      <span className="mt-1 border-t border-[var(--border)] pt-1.5">
        <button
          type="button"
          onClick={onViewHistory}
          className="-mx-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] [&>svg]:h-3 [&>svg]:w-3"
        >
          <HistoryIcon />
          View history
        </button>
      </span>
    </span>
  );
}
