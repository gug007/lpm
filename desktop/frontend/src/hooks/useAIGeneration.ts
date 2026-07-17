import { useCallback, useRef, useState } from "react";
import { CancelAIGenerate } from "../../bridge/commands";

// What the backend rejects a stopped run with. Callers stay silent on it: the
// user asked for the stop, so it isn't a failure worth reporting.
const AI_CANCELED = "canceled";

export function isCanceledError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg === AI_CANCELED;
}

export interface AIGeneration {
  generating: boolean;
  /** Run one generation, handing it a fresh id the stop control can reap. */
  run<T>(fn: (genId: string) => Promise<T>): Promise<T>;
  /** Run a fan-out of `count` generations that are stopped together. */
  runAll<T>(count: number, fn: (genIds: string[]) => Promise<T>): Promise<T>;
  cancel(): void;
}

/// One cancellable AI generation slot: mints the run's id, tracks it while it's
/// in flight, and turns a stop into a `canceled` rejection so callers can tell
/// it apart from a real failure even when the CLI managed to answer first.
export function useAIGeneration(): AIGeneration {
  const [generating, setGenerating] = useState(false);
  const live = useRef<Set<string>>(new Set());
  const stopped = useRef(false);

  const track = useCallback(
    async <T,>(ids: string[], fn: () => Promise<T>): Promise<T> => {
      ids.forEach((id) => live.current.add(id));
      stopped.current = false;
      setGenerating(true);
      try {
        const out = await fn();
        if (stopped.current) throw new Error(AI_CANCELED);
        return out;
      } finally {
        ids.forEach((id) => live.current.delete(id));
        if (live.current.size === 0) setGenerating(false);
      }
    },
    [],
  );

  const run = useCallback(
    <T,>(fn: (genId: string) => Promise<T>) => {
      const id = crypto.randomUUID();
      return track([id], () => fn(id));
    },
    [track],
  );

  const runAll = useCallback(
    <T,>(count: number, fn: (genIds: string[]) => Promise<T>) => {
      const ids = Array.from({ length: Math.max(1, count) }, () => crypto.randomUUID());
      return track(ids, () => fn(ids));
    },
    [track],
  );

  const cancel = useCallback(() => {
    if (live.current.size === 0) return;
    stopped.current = true;
    live.current.forEach((id) => {
      void CancelAIGenerate(id).catch(() => {});
    });
  }, []);

  return { generating, run, runAll, cancel };
}
