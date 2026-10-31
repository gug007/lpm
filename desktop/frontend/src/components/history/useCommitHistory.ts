import { useCallback, useEffect, useRef, useState } from "react";
import { GitHistory } from "../../../bridge/commands";
import { HISTORY_PAGE, type HistoryCommit } from "../../gitHistory";
import { useGitChanged } from "../../hooks/useGitChanged";

export interface CommitHistoryState {
  commits: HistoryCommit[];
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  loadMore: () => void;
}

/** The branch's commits, a page at a time, reloaded when the repo changes. */
export function useCommitHistory(projectPath: string): CommitHistoryState {
  const [commits, setCommits] = useState<HistoryCommit[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped per load so a slow answer can't overwrite a newer one.
  const seq = useRef(0);
  const shown = useRef(0);
  shown.current = commits.length;

  // `before` is what the page continues; a reload starts from nothing.
  const load = useCallback(
    async (before: HistoryCommit[], limit: number) => {
      const mine = ++seq.current;
      setLoading(true);
      try {
        const page = await GitHistory(projectPath, before.length, limit);
        if (mine !== seq.current) return;
        setCommits([...before, ...page.commits]);
        setHasMore(page.hasMore);
        setError(null);
      } catch (err) {
        if (mine === seq.current) setError(String(err));
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [projectPath],
  );

  useEffect(() => {
    void load([], HISTORY_PAGE);
  }, [load]);

  // A refresh keeps as many rows as were loaded, so the list doesn't shrink
  // under someone who scrolled down.
  const reload = useCallback(() => void load([], Math.max(HISTORY_PAGE, shown.current)), [load]);
  useGitChanged(projectPath, reload);

  const loadMore = useCallback(() => void load(commits, HISTORY_PAGE), [load, commits]);

  return { commits, hasMore, loading, error, loadMore };
}
