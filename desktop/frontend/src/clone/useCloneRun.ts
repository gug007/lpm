import { useCallback, useRef, useState } from "react";
import { CancelClone } from "../../bridge/commands";
import { prefixName } from "../peer/markers";
import { useCloneProgress } from "./useCloneProgress";

export type CloneOutcome = "done" | "cancelled";

// One clone at a time from the clone dialog: names it so its progress can be
// followed, and stops it on request. A clone on a paired computer is stopped
// there, routed by the marked id.
export function useCloneRun(peerSlug: string | null) {
  const [cloneId, setCloneId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const cancelRequested = useRef(false);
  const progress = useCloneProgress(cloneId);

  const start = useCallback(async (run: (cloneId: string) => Promise<void>): Promise<CloneOutcome> => {
    const id = crypto.randomUUID();
    cancelRequested.current = false;
    setCloneId(id);
    try {
      await run(id);
      return "done";
    } catch (err) {
      if (cancelRequested.current) return "cancelled";
      throw err;
    } finally {
      setCloneId(null);
      setCancelling(false);
    }
  }, []);

  const cancel = useCallback(async () => {
    if (!cloneId || cancelRequested.current) return;
    cancelRequested.current = true;
    setCancelling(true);
    try {
      await CancelClone(peerSlug ? prefixName(peerSlug, cloneId) : cloneId);
    } catch (err) {
      cancelRequested.current = false;
      setCancelling(false);
      throw err;
    }
  }, [cloneId, peerSlug]);

  return { running: cloneId !== null, progress, cancelling, start, cancel };
}
