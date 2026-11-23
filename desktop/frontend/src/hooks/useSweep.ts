import { useCallback, useEffect, useRef } from "react";
import { useEventListener } from "./useEventListener";

export interface SweepTiming {
  firstDelayMs: number;
  everyMs: number;
  focusThrottleMs: number;
}

// Runs `run` while `enabled`: once after `firstDelayMs`, then every `everyMs`,
// and on window focus at most once per `focusThrottleMs`. Never two at once,
// and never while the window is off screen. A change in `restartOn` starts the
// timers over.
export function useSweep(
  run: () => Promise<void>,
  enabled: boolean,
  timing: SweepTiming,
  restartOn: readonly unknown[] = [],
): void {
  const runRef = useRef(run);
  runRef.current = run;
  const busy = useRef(false);
  const last = useRef(0);

  const sweep = useCallback(async () => {
    if (busy.current || document.hidden) return;
    busy.current = true;
    last.current = Date.now();
    try {
      await runRef.current();
    } finally {
      busy.current = false;
    }
  }, []);

  const { firstDelayMs, everyMs, focusThrottleMs } = timing;
  useEffect(() => {
    if (!enabled) return;
    const first = setTimeout(() => void sweep(), firstDelayMs);
    const timer = setInterval(() => void sweep(), everyMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, firstDelayMs, everyMs, sweep, ...restartOn]);

  useEventListener(
    "focus",
    () => {
      if (Date.now() - last.current >= focusThrottleMs) void sweep();
    },
    window,
    enabled,
  );
}
