import { memo } from "react";
import { commitAgent, coAuthorName, type HistoryCommit } from "../../gitHistory";
import { relativeAgo } from "../../relativeTime";
import { AgentGlyph } from "../terminal/AgentGlyph";

interface HistoryCommitRowProps {
  commit: HistoryCommit;
  selected: boolean;
  first: boolean;
  last: boolean;
  onSelect: (hash: string) => void;
}

// The rail's mark says what the commit is by shape as well as color: filled
// for one no remote has yet, a ring once pushed, a diamond for a merge.
function railMark(commit: HistoryCommit) {
  if (commit.parents > 1) {
    return <span className="h-2 w-2 rotate-45 rounded-[1px] border border-[var(--text-muted)] bg-[var(--bg-primary)]" />;
  }
  if (commit.unpushed) {
    return <span className="h-2 w-2 rounded-full bg-[var(--accent-cyan)]" />;
  }
  return <span className="h-2 w-2 rounded-full border border-[var(--text-muted)] bg-[var(--bg-primary)]" />;
}

export const HistoryCommitRow = memo(function HistoryCommitRow({
  commit,
  selected,
  first,
  last,
  onSelect,
}: HistoryCommitRowProps) {
  const agent = commitAgent(commit);
  return (
    <button
      type="button"
      onClick={() => onSelect(commit.hash)}
      aria-current={selected || undefined}
      className={`group relative flex w-full items-center gap-2.5 rounded-md py-1.5 pl-2 pr-2.5 text-left transition-colors ${
        selected ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"
      }`}
    >
      <span aria-hidden className="relative flex w-3 shrink-0 justify-center self-stretch">
        <span
          className={`absolute left-1/2 w-px -translate-x-1/2 bg-[var(--text-muted)]/35 ${first ? "top-1/2" : "-top-1.5"} ${
            last ? "bottom-1/2" : "-bottom-1.5"
          }`}
        />
        <span className="relative flex items-center">{railMark(commit)}</span>
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-[13px] ${selected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"}`}
        title={commit.subject}
      >
        {commit.subject}
      </span>
      {agent && (
        <span title={`With ${coAuthorName(commit.coAuthors[0])}`} className="flex shrink-0">
          <AgentGlyph agent={agent} size={12} />
        </span>
      )}
      {commit.unpushed && (
        <span title="Not pushed yet" className="shrink-0 text-[11px] text-[var(--accent-cyan)]">
          ↑
        </span>
      )}
      <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-muted)]">
        {relativeAgo(commit.time)}
      </span>
    </button>
  );
});
