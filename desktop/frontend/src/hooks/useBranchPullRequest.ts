import { useCallback, useEffect, useRef } from "react";
import { BranchPullRequest } from "../../bridge/commands";
import { useBranchPr } from "../store/branchPr";
import { useEventListener } from "./useEventListener";
import { useGitChanged } from "./useGitChanged";
import type { PullRequestInfo } from "../types";

// A lookup younger than this is reused by focus and poll triggers.
export const FRESH_MS = 30_000;
// Background cadence while the pane is on screen: a PR the agent opens from
// the terminal shows up within a minute without hammering the GitHub API.
export const POLL_MS = 60_000;
// `gh pr create` pushes first and opens the PR a moment later; asking the
// instant the push lands finds nothing, so a git change waits this long.
export const GIT_CHANGE_DELAY_MS = 5_000;

// The pull request for `branch` in the project at `projectPath`, refreshed on
// branch change, window focus, git metadata changes and a slow poll while
// `active`. Null until known, or when the branch has none.
export function useBranchPullRequest(
  projectPath: string,
  branch: string,
  active = true,
): PullRequestInfo | null {
  const entry = useBranchPr((s) => s.entries[projectPath]);
  const setEntry = useBranchPr((s) => s.setEntry);
  const known = entry && entry.branch === branch ? entry : undefined;
  const checkedAtRef = useRef(0);
  checkedAtRef.current = known?.checkedAt ?? 0;
  const inFlight = useRef(false);
  const delayed = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lookup = useCallback(async () => {
    if (!projectPath || !branch || inFlight.current) return;
    inFlight.current = true;
    let pr: PullRequestInfo | null = null;
    try {
      pr = ((await BranchPullRequest(projectPath)) as PullRequestInfo | null) ?? null;
    } catch {
      pr = null;
    } finally {
      inFlight.current = false;
    }
    setEntry(projectPath, { branch, pr, checkedAt: Date.now() });
  }, [projectPath, branch, setEntry]);

  const lookupIfStale = useCallback(() => {
    if (Date.now() - checkedAtRef.current >= FRESH_MS) void lookup();
  }, [lookup]);

  useEffect(() => {
    if (!active) return;
    lookupIfStale();
    const timer = setInterval(lookupIfStale, POLL_MS);
    return () => clearInterval(timer);
  }, [active, lookupIfStale]);

  useEventListener("focus", lookupIfStale, window, active);

  // Working-tree edits arrive with a file list and say nothing about PRs; a
  // null list is `.git` metadata (commit, push, checkout), which is when one
  // may have appeared.
  const onGitChanged = useCallback(
    (files: string[] | null) => {
      if (files !== null) return;
      if (delayed.current) clearTimeout(delayed.current);
      delayed.current = setTimeout(() => {
        delayed.current = null;
        void lookup();
      }, GIT_CHANGE_DELAY_MS);
    },
    [lookup],
  );
  useGitChanged(projectPath, onGitChanged, active);

  useEffect(
    () => () => {
      if (delayed.current) clearTimeout(delayed.current);
    },
    [],
  );

  return known?.pr ?? null;
}
