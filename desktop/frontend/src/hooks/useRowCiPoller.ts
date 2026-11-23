import { useMemo, useRef } from "react";
import { fetchBranchCi } from "../branchCi";
import { entryChecks, rowBranch } from "../sidebarRowDetails";
import { layoutShows, type SidebarRowLayout } from "../sidebarRowLayout";
import { useBranchPr } from "../store/branchPr";
import { useOriginStatus } from "../store/originStatus";
import { useRowStats } from "../store/rowStats";
import type { ProjectInfo } from "../types";
import { useGitChangedRoots } from "./useGitChangedRoots";
import { originRoots } from "./useOriginStatusPoller";
import { useSweep, type SweepTiming } from "./useSweep";

const SWEEP_TIMING: SweepTiming = { firstDelayMs: 4_000, everyMs: 60_000, focusThrottleMs: 60_000 };
// A pull request rarely changes, and every look is a call to GitHub.
const CI_FRESH_MS = 5 * 60_000;
// While checks run, so the row turns red or green soon after they finish.
const CI_PENDING_FRESH_MS = 45_000;
// `gh pr create` pushes first and opens the PR a moment later.
const GIT_CHANGE_DELAY_MS = 5_000;

function branchOf(root: string): string {
  return rowBranch({ stats: useRowStats.getState().entries[root], origin: useOriginStatus.getState().entries[root] });
}

async function lookup(root: string, branch: string, withCommitChecks: boolean): Promise<void> {
  const { pr, commit } = await fetchBranchCi(root, withCommitChecks);
  // Without asking about the last commit, keep what the footer learned of it.
  const prev = useBranchPr.getState().entries[root];
  const kept = withCommitChecks || pr?.state === "OPEN" || prev?.branch !== branch ? commit : (prev.commit ?? null);
  useBranchPr.getState().setEntry(root, { branch, pr, commit: kept, checkedAt: Date.now() });
}

// Fills the same per-project pull request store the footer reads, for every
// project whose row shows its pull request or checks. A branch switch is
// looked up on the next sweep; checks that are still running are asked about
// more often than a quiet branch.
export function useRowCiPoller(projects: ProjectInfo[], layout: SidebarRowLayout): void {
  const wanted = layoutShows(layout, "pr", "checks");
  const withChecks = layoutShows(layout, "checks");
  const roots = useMemo(() => originRoots(projects), [projects]);
  const rootsRef = useRef(roots);
  rootsRef.current = roots;
  const checksRef = useRef(withChecks);
  checksRef.current = withChecks;

  useSweep(
    async () => {
      for (const root of rootsRef.current) {
        const branch = branchOf(root);
        if (!branch) continue;
        const entry = useBranchPr.getState().entries[root];
        if (entry && entry.branch === branch) {
          const pending = entryChecks(entry)?.verdict === "pending";
          const fresh = pending ? CI_PENDING_FRESH_MS : CI_FRESH_MS;
          if (Date.now() - entry.checkedAt < fresh) continue;
        }
        await lookup(root, branch, checksRef.current);
      }
    },
    wanted,
    SWEEP_TIMING,
    [withChecks],
  );

  // Only `.git` metadata (files: null) can mean a push or a new pull request.
  useGitChangedRoots(
    wanted,
    rootsRef,
    GIT_CHANGE_DELAY_MS,
    (root) => {
      const branch = branchOf(root);
      if (branch) void lookup(root, branch, checksRef.current);
    },
    (files) => files === null,
  );
}
