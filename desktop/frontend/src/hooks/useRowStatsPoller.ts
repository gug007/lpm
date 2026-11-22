import { useCallback, useEffect, useMemo, useRef } from "react";
import { ProjectRowStats } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import type { RowStats } from "../sidebarRowDetails";
import { rowStatsWanted, type SidebarRowLayout } from "../sidebarRowLayout";
import { useRowStats } from "../store/rowStats";
import { GIT_CHANGED_EVENT, type ProjectInfo } from "../types";
import { useEventListener } from "./useEventListener";
import { originRoots } from "./useOriginStatusPoller";

export const STATS_EVERY_MS = 60_000;
const FOCUS_THROTTLE_MS = 15_000;
const FIRST_SWEEP_DELAY_MS = 2_000;
// A save or a commit lands in several writes.
const GIT_CHANGE_DELAY_MS = 1_500;

// Keeps each project's row stats current while a row shows any of them: one
// project at a time once a minute while the window is on screen, again on
// focus, and for one project soon after its files or branch change.
export function useRowStatsPoller(projects: ProjectInfo[], layout: SidebarRowLayout): void {
  const wanted = rowStatsWanted(layout);
  const sinceBranch = layout.changesSince === "branch";
  const roots = useMemo(() => originRoots(projects), [projects]);
  const rootsKey = roots.join("\n");
  const rootsRef = useRef(roots);
  rootsRef.current = roots;
  const sinceRef = useRef(sinceBranch);
  sinceRef.current = sinceBranch;
  const sweeping = useRef(false);
  const lastSweep = useRef(0);

  const check = useCallback(async (root: string) => {
    try {
      const stats = (await ProjectRowStats(root, sinceRef.current)) as RowStats | null;
      if (stats) useRowStats.getState().set(root, stats);
    } catch {
      // A project that can't be read keeps what it last showed.
    }
  }, []);

  const sweep = useCallback(async () => {
    if (sweeping.current || document.hidden) return;
    sweeping.current = true;
    lastSweep.current = Date.now();
    try {
      for (const root of rootsRef.current) await check(root);
    } finally {
      sweeping.current = false;
    }
  }, [check]);

  useEffect(() => {
    if (!wanted) return;
    useRowStats.getState().retain(rootsKey ? rootsKey.split("\n") : []);
    const first = setTimeout(() => void sweep(), FIRST_SWEEP_DELAY_MS);
    const timer = setInterval(() => void sweep(), STATS_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [wanted, rootsKey, sinceBranch, sweep]);

  const onFocus = useCallback(() => {
    if (Date.now() - lastSweep.current >= FOCUS_THROTTLE_MS) void sweep();
  }, [sweep]);
  useEventListener("focus", onFocus, window, wanted);

  useEffect(() => {
    if (!wanted) return;
    const pending = new Map<string, ReturnType<typeof setTimeout>>();
    const cancel = EventsOn(GIT_CHANGED_EVENT, (payload: { path?: string } | string) => {
      const path = typeof payload === "string" ? payload : payload?.path;
      if (!path || !rootsRef.current.includes(path)) return;
      clearTimeout(pending.get(path));
      pending.set(
        path,
        setTimeout(() => {
          pending.delete(path);
          void check(path);
        }, GIT_CHANGE_DELAY_MS),
      );
    });
    return () => {
      if (typeof cancel === "function") cancel();
      pending.forEach(clearTimeout);
    };
  }, [wanted, check]);
}
