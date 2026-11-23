import { useEffect, useMemo, useRef } from "react";
import { ProjectRowStats } from "../../bridge/commands";
import type { RowStats } from "../sidebarRowDetails";
import { rowStatsWanted, type SidebarRowLayout } from "../sidebarRowLayout";
import { useRowStats } from "../store/rowStats";
import type { ProjectInfo } from "../types";
import { useEventListener } from "./useEventListener";
import { useGitChangedRoots } from "./useGitChangedRoots";
import { originRoots } from "./useOriginStatusPoller";
import { useSweep, type SweepTiming } from "./useSweep";

const SWEEP_TIMING: SweepTiming = { firstDelayMs: 2_000, everyMs: 60_000, focusThrottleMs: 15_000 };
// A save or a commit lands in several writes.
const GIT_CHANGE_DELAY_MS = 1_500;

async function check(root: string, sinceBranch: boolean): Promise<void> {
  try {
    const stats = (await ProjectRowStats(root, sinceBranch)) as RowStats | null;
    if (stats) useRowStats.getState().set(root, stats);
  } catch {
    // A project that can't be read keeps what it last showed.
  }
}

// Keeps each project's row stats current while a row shows any of them: one
// project at a time once a minute while the window is on screen, again on
// focus, and for one project soon after its files or branch change. Changes
// while the window is off screen are looked at once it is back.
export function useRowStatsPoller(projects: ProjectInfo[], layout: SidebarRowLayout): void {
  const wanted = rowStatsWanted(layout);
  const sinceBranch = layout.changesSince === "branch";
  const roots = useMemo(() => originRoots(projects), [projects]);
  const rootsKey = roots.join("\n");
  const rootsRef = useRef(roots);
  rootsRef.current = roots;
  const sinceRef = useRef(sinceBranch);
  sinceRef.current = sinceBranch;
  const missed = useRef(new Set<string>());

  useEffect(() => {
    if (wanted) useRowStats.getState().retain(rootsKey ? rootsKey.split("\n") : []);
  }, [wanted, rootsKey]);

  useSweep(
    async () => {
      for (const root of rootsRef.current) await check(root, sinceRef.current);
    },
    wanted,
    SWEEP_TIMING,
    [rootsKey, sinceBranch],
  );

  useGitChangedRoots(wanted, rootsRef, GIT_CHANGE_DELAY_MS, (root) => {
    if (document.hidden) missed.current.add(root);
    else void check(root, sinceRef.current);
  });

  useEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) return;
      const roots = [...missed.current].filter((root) => rootsRef.current.includes(root));
      missed.current.clear();
      for (const root of roots) void check(root, sinceRef.current);
    },
    document,
    wanted,
  );
}
