import { useState } from "react";
import { CircleDot, X } from "lucide-react";
import type { OpenIssue } from "../issues";
import { IssueList } from "./IssueList";
import { CARD_CLASS, HELPER_TEXT, SECTION_LABEL } from "./ui/fields";

interface WorktreeIssueRowProps {
  root: string;
  issue: OpenIssue | null;
  // The issue is picked and its text is still being read.
  reading: boolean;
  onPick: (issue: OpenIssue) => void;
  onClear: () => void;
}

// In the New worktree dialog: the issue the worktrees start from, or the way to
// pick one.
export function WorktreeIssueRow({ root, issue, reading, onPick, onClear }: WorktreeIssueRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={CARD_CLASS}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={`${SECTION_LABEL} shrink-0`}>Issue</span>
        {issue ? (
          <>
            <span className="flex min-w-0 flex-1 items-baseline justify-end gap-2 text-[13px]">
              <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--accent-violet-text)]">
                #{issue.number}
              </span>
              <span className="truncate text-[var(--text-primary)]">{issue.title}</span>
            </span>
            <button
              type="button"
              onClick={onClear}
              aria-label="Don't start from this issue"
              className="-mr-1 shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            <CircleDot size={13} className="text-[var(--text-muted)]" />
            From issue…
          </button>
        )}
      </div>
      {issue && (
        <p className={`-mt-1 px-4 pb-3 ${HELPER_TEXT}`}>
          {reading ? (
            "Reading the issue…"
          ) : (
            <>
              On branch <span className="font-mono text-[var(--text-secondary)]">{issue.branch}</span>. Its pull request
              closes #{issue.number}.
            </>
          )}
        </p>
      )}
      {open && !issue && (
        <IssueList
          root={root}
          onPick={(picked) => {
            setOpen(false);
            onPick(picked);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
