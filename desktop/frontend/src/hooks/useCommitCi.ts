import { useCallback, useEffect, useRef, useState } from "react";
import { RecentCommitChecks } from "../../bridge/commands";
import { commitCiStates, hasRunningCi, NO_COMMIT_CI, type CommitCiStates } from "../commitCi";
import { CHECKS_POLL_MS, GIT_CHANGE_DELAY_MS } from "./useBranchPullRequest";
import { useGitChanged } from "./useGitChanged";

/** How the branch's recent pushed commits did on CI, asked for on mount, after a
 *  git metadata change and every so often while something is still running. A
 *  repo without CI, or a connected computer too old to answer, has none. */
export function useCommitCi(projectPath: string): CommitCiStates {
  const [states, setStates] = useState<CommitCiStates>(NO_COMMIT_CI);
  // Bumped per ask so a slow answer can't overwrite a newer one.
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const commits = await RecentCommitChecks(projectPath).catch(() => []);
    if (mine === seq.current) setStates(commitCiStates(commits));
  }, [projectPath]);

  useEffect(() => {
    void load();
    return () => {
      seq.current += 1;
    };
  }, [load]);

  const running = hasRunningCi(states);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(), CHECKS_POLL_MS);
    return () => clearInterval(timer);
  }, [running, load]);

  const delayed = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onGitChanged = useCallback(
    (files: string[] | null) => {
      if (files !== null) return;
      if (delayed.current) clearTimeout(delayed.current);
      delayed.current = setTimeout(() => void load(), GIT_CHANGE_DELAY_MS);
    },
    [load],
  );
  useGitChanged(projectPath, onGitChanged);
  useEffect(
    () => () => {
      if (delayed.current) clearTimeout(delayed.current);
    },
    [],
  );

  return states;
}
