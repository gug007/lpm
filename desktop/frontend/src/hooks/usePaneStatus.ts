import { useMemo } from "react";
import {
  STATUS_DONE,
  STATUS_ERROR,
  STATUS_RUNNING,
  STATUS_WAITING,
  type StatusEntry,
} from "../types";

export interface PaneStatus {
  running: Set<string>;
  done: Set<string>;
  waiting: Set<string>;
  error: Set<string>;
}

// Buckets pane IDs by their current status entry so TerminalView can
// render the right indicator per pane in a single pass.
export function usePaneStatus(entries: StatusEntry[] | undefined): PaneStatus {
  return useMemo(() => {
    const running = new Set<string>();
    const done = new Set<string>();
    const waiting = new Set<string>();
    const error = new Set<string>();
    for (const e of entries ?? []) {
      if (!e.paneID) continue;
      if (e.value === STATUS_RUNNING) running.add(e.paneID);
      else if (e.value === STATUS_DONE) done.add(e.paneID);
      else if (e.value === STATUS_WAITING) waiting.add(e.paneID);
      else if (e.value === STATUS_ERROR) error.add(e.paneID);
    }
    return { running, done, waiting, error };
  }, [entries]);
}
