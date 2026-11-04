import type { HistoryCommit } from "../gitHistory";
import { relativeAgo } from "../relativeTime";
import { CommitCiIcon } from "./CommitCiIcon";

interface BranchCommitRowProps {
  commit: HistoryCommit;
  latest: boolean;
}

/** One commit in the branch's hover card, marked on the right if it isn't pushed yet. */
export function BranchCommitRow({ commit, latest }: BranchCommitRowProps) {
  return (
    <span className="flex min-w-0 items-center gap-3">
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
      {commit.unpushed && <CommitCiIcon mark="unpushed" size={14} />}
    </span>
  );
}
