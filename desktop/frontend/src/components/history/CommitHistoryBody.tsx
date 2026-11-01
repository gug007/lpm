import { useMemo, useState } from "react";
import { buildGraph } from "../../gitGraph";
import { remoteBoundary } from "../../gitHistory";
import { SourceControlIcon, XIcon } from "../icons";
import { GAP_H, MAX_LANES } from "./graphGeometry";
import { HistoryCommitDetail } from "./HistoryCommitDetail";
import { HistoryCommitRow } from "./HistoryCommitRow";
import { HistoryGraphGap } from "./HistoryGraphGap";
import { useCommitHistory } from "./useCommitHistory";

interface CommitHistoryBodyProps {
  projectPath: string;
  branch: string;
  onClose: () => void;
}

/** What the History modal holds, mounted only while it is open. */
export function CommitHistoryBody({ projectPath, branch, onClose }: CommitHistoryBodyProps) {
  const history = useCommitHistory(projectPath);
  const { commits } = history;
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [hoverBranch, setHoverBranch] = useState<number | null>(null);
  const graph = useMemo(() => buildGraph(commits), [commits]);
  const lanes = Math.min(graph.width, MAX_LANES);

  const selected = commits.find((c) => c.hash === selectedHash) ?? commits[0] ?? null;
  const boundary = remoteBoundary(commits);
  const unpushed = commits.filter((c) => c.unpushed).length;

  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-[14px] font-medium text-[var(--text-primary)]">History</h2>
        {branch && (
          <span className="flex min-w-0 items-center gap-1.5 font-mono text-[12px] text-[var(--text-secondary)]">
            <SourceControlIcon size={12} />
            <span className="truncate">{branch}</span>
          </span>
        )}
        {unpushed > 0 && (
          <span className="shrink-0 text-[12px] text-[var(--accent-cyan)]">
            {unpushed}
            {history.hasMore && unpushed === commits.length ? "+" : ""} not pushed
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <XIcon />
        </button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="min-h-0 overflow-y-auto border-r border-[var(--border)] p-2">
          {history.error && commits.length === 0 && (
            <div className="px-2 py-2 text-[12px] text-[var(--accent-red-text)]">{history.error}</div>
          )}
          {!history.loading && !history.error && commits.length === 0 && (
            <div className="px-2 py-2 text-[12px] text-[var(--text-muted)]">No commits on this branch yet.</div>
          )}
          {commits.map((commit, i) => (
            <div key={commit.hash}>
              {i === boundary && (
                <div className="flex items-stretch gap-2.5 pl-2 pr-2.5" style={{ height: GAP_H }}>
                  <HistoryGraphGap lines={graph.rows[i - 1].bottom} lanes={lanes} hover={hoverBranch} />
                  <div className="flex flex-1 items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    <span className="h-px flex-1 bg-[var(--border)]" />
                    Pushed
                    <span className="h-px flex-1 bg-[var(--border)]" />
                  </div>
                </div>
              )}
              <HistoryCommitRow
                commit={commit}
                graph={graph.rows[i]}
                lanes={lanes}
                hover={hoverBranch}
                selected={commit.hash === selected?.hash}
                onSelect={setSelectedHash}
                onHover={setHoverBranch}
              />
            </div>
          ))}
          {history.hasMore && (
            <button
              type="button"
              onClick={history.loadMore}
              disabled={history.loading}
              className="mx-auto mt-2 block rounded-md px-3 py-1 text-[12px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              {history.loading ? "Loading…" : "Load older commits"}
            </button>
          )}
        </div>
        {selected ? (
          <HistoryCommitDetail key={selected.hash} projectPath={projectPath} commit={selected} />
        ) : (
          <div />
        )}
      </div>
    </>
  );
}
