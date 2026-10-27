import { useCallback, useEffect, useRef, useState } from "react";
import { cancelSync, type RunWatch, type SyncDone, type SyncProgress } from "./ignoredSyncApi";

/// Starts run `id`, reporting through `watch`; answers how to stop listening.
export type BeginRun = (id: string, watch: RunWatch) => Promise<() => void>;

export interface SyncRun {
  // Set from the moment a run starts until it is done.
  progress: SyncProgress | null;
  done: SyncDone | null;
  start: (begin: BeginRun) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

/// One run at a time, followed through its progress and done events.
export function useSyncRun(onError: (message: string) => void): SyncRun {
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [done, setDone] = useState<SyncDone | null>(null);
  const id = useRef<string | null>(null);
  const stopListening = useRef<() => void>(() => {});

  useEffect(() => () => stopListening.current(), []);

  const start = useCallback(
    async (begin: BeginRun) => {
      const runId = crypto.randomUUID();
      id.current = runId;
      setDone(null);
      setProgress({ id: runId, phase: "comparing" });
      try {
        stopListening.current = await begin(runId, {
          onProgress: setProgress,
          onDone: (d) => {
            setProgress(null);
            if (d.cancelled && !d.files) return;
            if (!d.ok && d.error && !d.files) onError(d.error);
            else setDone(d);
          },
        });
      } catch (err) {
        setProgress(null);
        onError(String(err));
      }
    },
    [onError],
  );

  const cancel = useCallback(() => {
    if (id.current) void cancelSync(id.current);
  }, []);

  const reset = useCallback(() => setDone(null), []);
  return { progress, done, start, cancel, reset };
}
