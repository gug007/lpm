import { useCallback, useEffect, useMemo, useRef } from "react";
import { EventsOn } from "../../bridge/runtime";
import { recheckOrigin } from "../originActions";
import { isPeerName, isPeerRoot } from "../peer/markers";
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

export function originRoots(projects: ProjectInfo[]): string[] {
  const roots = projects
    .filter((p) => p.root && !p.isRemote && !p.configError && !isPeerName(p.name) && !isPeerRoot(p.root))
    .map((p) => p.root);
  return [...new Set(roots)].sort();
}

// Keeps the origin store current for every local project: a quiet fetch per
// project every FETCH_EVERY_MS, a recount on window focus, and a recount when
// the watched project's .git changes. One project at a time, so a slow remote
// never stacks up git processes.
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
      // Working-tree edits carry a file list and can't move a branch.
      if (!root || payload.files || !rootsRef.current.includes(root)) return;
      clearTimeout(pending.get(root));
      pending.set(root, setTimeout(() => {
        pending.delete(root);
        if (!useOriginStatus.getState().entries[root]?.running) void recheckOrigin(root);
      }, GIT_CHANGE_DELAY_MS));
    });
    return () => {
      pending.forEach(clearTimeout);
      if (typeof cancel === "function") cancel();
    };
  }, [enabled]);
}
