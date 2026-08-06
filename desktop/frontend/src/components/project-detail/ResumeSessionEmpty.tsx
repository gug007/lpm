import { HistoryIcon } from "../icons";
import { providerMeta } from "../../agentStatus";
import type { SessionFilter } from "../../agentSessions";

interface ResumeSessionEmptyProps {
  searching: boolean;
  term: string;
  provider: SessionFilter;
  // The transcripts couldn't be read at all — agents that run on another
  // machine keep their conversations there.
  failed: boolean;
  hiddenCount: number;
  onShowAll: () => void;
  // Widening the scan is the only way past an empty page; absent when the
  // scan already reached the end.
  onMore?: () => void;
  moreLabel: string;
}

const BUTTON =
  "rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]";

// Why the list is empty, phrased as what the user can do about it — a filtered
// page and an unreadable project are not the same "nothing here".
export function ResumeSessionEmpty({
  searching,
  term,
  provider,
  failed,
  hiddenCount,
  onShowAll,
  onMore,
  moreLabel,
}: ResumeSessionEmptyProps) {
  const filtered = provider !== "all";
  const short = providerMeta(provider).short;
  // "Nothing here" would be a lie when the user is the one who emptied it.
  const allHidden = !failed && !searching && !filtered && hiddenCount > 0;

  const title = failed
    ? "Past conversations aren't available for this project"
    : searching
      ? "No matching sessions"
      : filtered
        ? `No ${short} sessions on this page`
        : allHidden
          ? "Nothing left to show"
          : "No sessions yet";

  const body = failed
    ? "Only tabs closed here are listed."
    : searching
      ? `Nothing matches “${term}” in the sessions loaded so far.`
      : filtered
        ? "Other agents may still have sessions here."
        : allHidden
          ? `${hiddenCount} ${hiddenCount === 1 ? "session is" : "sessions are"} hidden from this list.`
          : "Conversations you have with Claude Code or Codex in this project show up here, ready to pick up again.";

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] [&>svg]:h-4 [&>svg]:w-4">
        <HistoryIcon />
      </span>
      <span className="text-xs font-medium text-[var(--text-secondary)]">{title}</span>
      <span className="max-w-[320px] text-[11px] leading-relaxed text-[var(--text-muted)]">
        {body}
      </span>
      {!failed && (filtered || onMore) && (
        <div className="mt-2 flex items-center gap-2">
          {filtered && (
            <button type="button" onClick={onShowAll} className={BUTTON}>
              Show all
            </button>
          )}
          {onMore && (
            <button type="button" onClick={onMore} className={BUTTON}>
              {moreLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
