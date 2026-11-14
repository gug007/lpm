import { useEffect, useState } from "react";
import { EventsOn } from "../../bridge/runtime";
import {
  CLONE_PROGRESS_EVENT,
  applyCloneProgress,
  type CloneProgress,
  type CloneProgressEvent,
} from "./cloneProgress";

// How far the clone `id` has got, from its `clone-progress` events (a paired
// computer's arrive forwarded). Null until the first one, or with no clone.
export function useCloneProgress(id: string | null): CloneProgress | null {
  const [progress, setProgress] = useState<CloneProgress | null>(null);
  useEffect(() => {
    setProgress(null);
    if (!id) return;
    return EventsOn(CLONE_PROGRESS_EVENT, (payload: unknown) => {
      const e = payload as CloneProgressEvent | null;
      if (!e || e.id !== id) return;
      setProgress((prev) => applyCloneProgress(prev, e));
    });
  }, [id]);
  return progress;
}
