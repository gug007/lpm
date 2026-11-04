import { useCallback, useEffect, useMemo, useRef } from "react";
import { WatchOriginRefs } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import { maybeAutoPull } from "../autoPullRun";
import { recheckOrigin } from "../originActions";
import { followOriginMoves } from "../originSpread";
import { originMark } from "../originStatus";
import { isPeerRoot } from "../peer/markers";
import { useOriginStatus } from "../store/originStatus";
import { GIT_CHANGED_EVENT, type ProjectInfo } from "../types";
import { useEventListener } from "./useEventListener";

// A fetch per project at most this often; checks in between only recount.
export const FETCH_EVERY_MS = 10 * 60_000;
// A round the timer starts finds every project due, even those fetched a few
// seconds into the previous round.
const FETCH_DUE_MS = FETCH_EVERY_MS - 60_000;
// Window focus recounts, but not more often than this.
export const FOCUS_THROTTLE_MS = 30_000;
// Leaves app startup alone before the first round of fetches.
const FIRST_SWEEP_DELAY_MS = 5_000;
// A commit or pull from the terminal lands in .git in several writes.
const GIT_CHANGE_DELAY_MS = 1_500;

// A connected Mac's projects are checked on that Mac, so they go after this
// Mac's own: a slow or sleeping machine never holds up the local rows.
export function originRoots(projects: ProjectInfo[]): string[] {
  const roots = projects.filter((p) => p.root && !p.isRemote && !p.configError).map((p) => p.root);
  const unique = [...new Set(roots)].sort();
  return [...unique.filter((root) => !isPeerRoot(root)), ...unique.filter(isPeerRoot)];
}

// Keeps the origin store current for every project here and on connected Macs:
// a quiet fetch per project every FETCH_EVERY_MS, a recount on window focus, and
// a recount when a project's .git changes, which for this Mac's own projects
// includes origin moving under refs/remotes. One project at a time, so a slow
// remote never stacks up git processes. Each check is followed by an auto pull
// try, which does nothing unless the project is set to pull itself, and origin
// moving in one copy of a repository fetches the copies behind it.
export function useOriginStatusPoller(projects: ProjectInfo[], enabled: boolean): void {
  const roots = useMemo(() => originRoots(projects), [projects]);
  const rootsKey = roots.join("\n");
  const rootsRef = useRef(roots);
  rootsRef.current = roots;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const lastFetch = useRef(new Map<string, number>());
  const lastSweep = useRef(0);
  const sweeping = useRef(false);

  const sweep = useCallback(async () => {
    if (sweeping.current) return;
    sweeping.current = true;
    lastSweep.current = Date.now();
    try {
      for (const root of rootsRef.current) {
        if (!enabledRef.current) return;
        if (useOriginStatus.getState().entries[root]?.running) continue;
        const due = Date.now() - (lastFetch.current.get(root) ?? 0) >= FETCH_DUE_MS;
        if (due) lastFetch.current.set(root, Date.now());
        await recheckOrigin(root, due);
        await maybeAutoPull(root);
      }
    } finally {
      sweeping.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      useOriginStatus.getState().reset();
      return;
    }
    useOriginStatus.getState().retain(rootsKey ? rootsKey.split("\n") : []);
    const first = setTimeout(() => void sweep(), FIRST_SWEEP_DELAY_MS);
    const timer = setInterval(() => void sweep(), FETCH_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [enabled, rootsKey, sweep]);

  useEffect(() => {
    void WatchOriginRefs(enabled ? rootsRef.current.filter((root) => !isPeerRoot(root)) : []).catch(() => {});
  }, [enabled, rootsKey]);

  useEffect(() => (enabled ? followOriginMoves() : undefined), [enabled]);

  useEventListener(
    "focus",
    () => {
      if (Date.now() - lastSweep.current >= FOCUS_THROTTLE_MS) void sweep();
    },
    window,
    enabled,
  );

  useEffect(() => {
    if (!enabled) return;
    const pending = new Map<string, ReturnType<typeof setTimeout>>();
    const cancel = EventsOn(GIT_CHANGED_EVENT, (payload: { path?: string; files?: string[] | null }) => {
      const root = payload?.path;
      if (!root || !rootsRef.current.includes(root)) return;
      // Working-tree edits carry a file list. They can't move a branch, but they
      // can stand in the way of a pull from origin, or stop doing so.
      if (payload.files && !originMark(useOriginStatus.getState().entries[root]?.status)) return;
      clearTimeout(pending.get(root));
      pending.set(root, setTimeout(() => {
        pending.delete(root);
        if (useOriginStatus.getState().entries[root]?.running) return;
        void recheckOrigin(root).then(() => maybeAutoPull(root));
      }, GIT_CHANGE_DELAY_MS));
    });
    return () => {
      pending.forEach(clearTimeout);
      if (typeof cancel === "function") cancel();
    };
  }, [enabled]);
}
