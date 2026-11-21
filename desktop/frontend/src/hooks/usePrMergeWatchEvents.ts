import { useEffect } from "react";
import { EventsOn } from "../../bridge/runtime";
import { toast } from "../notifications/toast";
import { afterMerge } from "../prMergeDone";
import { usePrMergeWatch } from "../store/prMergeWatch";
import { PR_MERGE_WATCH_EVENT, type PrMergeWatch } from "../types";

/** Keeps the waits to merge once checks pass current, here and on connected
 *  computers, and says how each ended: merged, or stopped and why. */
export function usePrMergeWatchEvents(): void {
  useEffect(() => {
    const off = EventsOn(PR_MERGE_WATCH_EVENT, (watch: PrMergeWatch) => {
      if (!watch?.path) return;
      usePrMergeWatch.getState().apply(watch);
      if (watch.state === "merged") void afterMerge(watch.path, watch.number, watch.deletedBranch);
      if (watch.state === "stopped") {
        toast.error(`Stopped waiting to merge #${watch.number}`, { description: watch.reason, event: "ci" });
      }
    });
    return () => {
      if (typeof off === "function") off();
    };
  }, []);
}
