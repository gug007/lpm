import { useCallback, useEffect, useMemo, useRef } from "react";
import { EventsOn } from "../../bridge/runtime";
import { readMergedCopy } from "../mergedCopies";
import { useMergedCopies } from "../store/mergedCopies";
import { GIT_CHANGED_EVENT, type ProjectInfo } from "../types";
import { useEventListener } from "./useEventListener";
import { originRoots } from "./useOriginStatusPoller";

const SWEEP_EVERY_MS = 5 * 60_000;
const FOCUS_THROTTLE_MS = 2 * 60_000;
// Leaves app startup to the origin poller's first round.
const FIRST_SWEEP_DELAY_MS = 8_000;
// A save or a commit lands in several writes.
const GIT_CHANGE_DELAY_MS = 1_500;

// Keeps the merged-copies store current: every copy's pull request on a slow
// sweep, one at a time so a long list never stacks up `gh` processes, and a
// copy already marked merged again as soon as its files or commits change, so
// fresh work takes it out of the offer.
export function useMergedCopiesPoller(projects: ProjectInfo[], enabled: boolean): void {
  const roots = useMemo(() => originRoots(projects.filter((p) => p.parentName)), [projects]);
  const rootsKey = roots.join("\n");
  const rootsRef = useRef(roots);
  rootsRef.current = roots;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const lastSweep = useRef(0);
  const sweeping = useRef(false);

  const sweep = useCallback(async () => {
    if (sweeping.current || document.hidden) return;
    sweeping.current = true;
    lastSweep.current = Date.now();
    try {
      for (const root of rootsRef.current) {
        if (!enabledRef.current) return;
        useMergedCopies.getState().setEntry(root, await readMergedCopy(root));
      }
    } finally {
      sweeping.current = false;
    }
  }, []);

  useEffect(() => {
    useMergedCopies.getState().retain(enabled && rootsKey ? rootsKey.split("\n") : []);
    if (!enabled) return;
    const first = setTimeout(() => void sweep(), FIRST_SWEEP_DELAY_MS);
    const timer = setInterval(() => void sweep(), SWEEP_EVERY_MS);
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
    const cancel = EventsOn(GIT_CHANGED_EVENT, (payload: { path?: string }) => {
      const root = payload?.path;
      if (!root || !useMergedCopies.getState().entries[root]) return;
      clearTimeout(pending.get(root));
      pending.set(root, setTimeout(() => {
        pending.delete(root);
        void readMergedCopy(root).then((copy) => useMergedCopies.getState().setEntry(root, copy));
      }, GIT_CHANGE_DELAY_MS));
    });
    return () => {
      pending.forEach(clearTimeout);
      if (typeof cancel === "function") cancel();
    };
  }, [enabled]);
}
