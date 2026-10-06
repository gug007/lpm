import { EventsOnReady } from "../../bridge/runtime";

export interface ActionDone {
  success: boolean;
  error?: string;
}

export interface ActionRunSnapshot {
  lines: string[];
  done: ActionDone | null;
}

export interface ActionRunCapture {
  snapshot: () => ActionRunSnapshot;
  subscribe: (onChange: () => void) => () => void;
  dispose: () => void;
}

// An inline action streams its output as global events straight from the
// process, and a fast one is finished before RunAction even returns. Listening
// only once the output modal mounts loses those events, leaving the modal on
// "Running..." with no output, so the capture attaches before the run starts.
export async function captureActionRun(): Promise<ActionRunCapture> {
  let snap: ActionRunSnapshot = { lines: [], done: null };
  const watchers = new Set<() => void>();
  const update = (next: ActionRunSnapshot) => {
    snap = next;
    watchers.forEach((w) => w());
  };
  const offs = await Promise.all([
    EventsOnReady("action-output", (data: { line: string }) => update({ ...snap, lines: [...snap.lines, data.line] })),
    EventsOnReady("action-done", (data: ActionDone) => update({ ...snap, done: data })),
  ]);
  return {
    snapshot: () => snap,
    subscribe: (onChange) => {
      watchers.add(onChange);
      return () => watchers.delete(onChange);
    },
    dispose: () => offs.forEach((off) => off()),
  };
}
