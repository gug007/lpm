import { useCallback, useEffect, useMemo, useRef } from "react";
import { EventsOn } from "../../bridge/runtime";
import { fetchBranchCi } from "../branchCi";
import { entryChecks } from "../sidebarRowDetails";
import { layoutShows, type SidebarRowLayout } from "../sidebarRowLayout";
import { useBranchPr } from "../store/branchPr";
import { useOriginStatus } from "../store/originStatus";
import { useRowStats } from "../store/rowStats";
import { GIT_CHANGED_EVENT, type ProjectInfo } from "../types";
import { useEventListener } from "./useEventListener";
import { originRoots } from "./useOriginStatusPoller";

const SWEEP_EVERY_MS = 60_000;
// A pull request rarely changes, and every look is a call to GitHub.
export const CI_FRESH_MS = 5 * 60_000;
// While checks run, so the row turns red or green soon after they finish.
export const CI_PENDING_FRESH_MS = 45_000;
const FOCUS_THROTTLE_MS = 60_000;
const FIRST_SWEEP_DELAY_MS = 4_000;
// `gh pr create` pushes first and opens the PR a moment later.
const GIT_CHANGE_DELAY_MS = 5_000;

function branchOf(root: string): string {
  return useRowStats.getState().entries[root]?.branch || useOriginStatus.getState().entries[root]?.status.branch || "";
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
  const sweeping = useRef(false);
  const lastSweep = useRef(0);

  const lookup = useCallback(async (root: string, branch: string) => {
    const withCommitChecks = checksRef.current;
    const { pr, commit } = await fetchBranchCi(root, withCommitChecks);
    // Without asking about the last commit, keep what the footer learned of it.
    const prev = useBranchPr.getState().entries[root];
    const kept = withCommitChecks || pr?.state === "OPEN" || prev?.branch !== branch ? commit : (prev.commit ?? null);
    useBranchPr.getState().setEntry(root, { branch, pr, commit: kept, checkedAt: Date.now() });
  }, []);

  const sweep = useCallback(async () => {
    if (sweeping.current || document.hidden) return;
    sweeping.current = true;
    lastSweep.current = Date.now();
    try {
      for (const root of rootsRef.current) {
        const branch = branchOf(root);
        if (!branch) continue;
        const entry = useBranchPr.getState().entries[root];
        if (entry && entry.branch === branch) {
          const pending = entryChecks(entry)?.verdict === "pending";
          const fresh = pending ? CI_PENDING_FRESH_MS : CI_FRESH_MS;
          if (Date.now() - entry.checkedAt < fresh) continue;
        }
        await lookup(root, branch);
      }
    } finally {
      sweeping.current = false;
    }
  }, [lookup]);

  useEffect(() => {
    if (!wanted) return;
    const first = setTimeout(() => void sweep(), FIRST_SWEEP_DELAY_MS);
    const timer = setInterval(() => void sweep(), SWEEP_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [wanted, withChecks, sweep]);

  const onFocus = useCallback(() => {
    if (Date.now() - lastSweep.current >= FOCUS_THROTTLE_MS) void sweep();
  }, [sweep]);
  useEventListener("focus", onFocus, window, wanted);

  // Only `.git` metadata (files: null) can mean a push or a new pull request.
  useEffect(() => {
    if (!wanted) return;
    const pending = new Map<string, ReturnType<typeof setTimeout>>();
    const cancel = EventsOn(GIT_CHANGED_EVENT, (payload: { path?: string; files?: string[] | null } | string) => {
      const path = typeof payload === "string" ? payload : payload?.path;
      const files = typeof payload === "string" ? null : (payload?.files ?? null);
      if (!path || files !== null || !rootsRef.current.includes(path)) return;
      clearTimeout(pending.get(path));
      pending.set(
        path,
        setTimeout(() => {
          pending.delete(path);
          const branch = branchOf(path);
          if (branch) void lookup(path, branch);
        }, GIT_CHANGE_DELAY_MS),
      );
    });
    return () => {
      if (typeof cancel === "function") cancel();
      pending.forEach(clearTimeout);
    };
  }, [wanted, lookup]);
}
