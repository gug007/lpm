import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { toastMessages } from "./dialog-data";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
const FIRST_MS = 700;
const DONE_MS = 2600;
const DONE_REDUCED_MS = 4000;

const subscribe = (notify: () => void) => {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", notify);
  return () => mq.removeEventListener("change", notify);
};
const reducedSnapshot = () => window.matchMedia(REDUCED_QUERY).matches;

const perCopyMs = (count: number) =>
  Math.min(800, Math.max(60, Math.round(3200 / count)));

type Run = { id: number; count: number; messages: string[]; step: number };

export type ToastView = {
  id: number;
  text: string;
  done: boolean;
  announce: string;
} | null;

// Replays the app's bulkDuplicate toasts (store/app.ts). Screen readers hear
// only the first and last message, so a 50-copy run doesn't queue 50 updates.
export function useToastSequence() {
  const reduced = useSyncExternalStore(subscribe, reducedSnapshot, () => false);
  const [run, setRun] = useState<Run | null>(null);

  const play = useCallback(
    (count: number) => {
      const messages = toastMessages(count);
      setRun((prev) => ({
        id: (prev?.id ?? 0) + 1,
        count,
        messages,
        step: reduced ? messages.length - 1 : 0,
      }));
    },
    [reduced],
  );

  useEffect(() => {
    if (!run) return;
    const last = run.messages.length - 1;
    const delay =
      run.step === last
        ? reduced
          ? DONE_REDUCED_MS
          : DONE_MS
        : run.step === 0
          ? FIRST_MS
          : perCopyMs(run.count);
    const timer = window.setTimeout(() => {
      setRun((current) => {
        if (current !== run) return current;
        return run.step >= last ? null : { ...run, step: run.step + 1 };
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [run, reduced]);

  const view: ToastView = run
    ? {
        id: run.id,
        text: run.messages[run.step],
        done: run.step === run.messages.length - 1,
        announce:
          run.step === run.messages.length - 1
            ? run.messages[run.step]
            : run.messages[0],
      }
    : null;

  return { toast: view, play };
}
