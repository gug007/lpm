import { EventsOn } from "../../bridge/runtime";

const MAX_LINES = 300;

const runLines = new Map<string, string[]>();
const runListeners = new Map<string, Set<() => void>>();
let listenerAttached = false;

function ensureListener() {
  if (listenerAttached) return;
  listenerAttached = true;
  EventsOn("action-bg-output", (data: { runId: string; line: string }) => {
    if (!runLines.has(data.runId)) return;
    const prev = runLines.get(data.runId)!;
    const next = [...prev, data.line];
    if (next.length > MAX_LINES) next.splice(0, next.length - MAX_LINES);
    runLines.set(data.runId, next);
    runListeners.get(data.runId)?.forEach((cb) => cb());
  });
}

const EMPTY: string[] = [];

export function trackBackgroundRun(runId: string) {
  ensureListener();
  runLines.set(runId, []);
}

export function getBackgroundRunLines(runId: string): string[] {
  return runLines.get(runId) ?? EMPTY;
}

export function subscribeBackgroundRun(runId: string, cb: () => void) {
  let set = runListeners.get(runId);
  if (!set) {
    set = new Set();
    runListeners.set(runId, set);
  }
  set.add(cb);
  return () => {
    set.delete(cb);
    if (set.size === 0) runListeners.delete(runId);
  };
}

export function clearBackgroundRun(runId: string) {
  runLines.delete(runId);
}
