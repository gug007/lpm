import { useCallback } from "react";
import { toast } from "../notifications/toast";
import { RunJobNow, SetJobEnabled, StopJobRun } from "../../bridge/commands";

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Runs a job now; a refusal (job off, waiting on an answer) is told as a toast. */
export function runJobNow(project: string, id: string): void {
  RunJobNow(project, id).catch((err) => toast.error(errorText(err)));
}

// Automations row buttons, for one job in one project. They fire-and-forget; a
// rejection (invalid job, gone project) must still reach the user instead of
// dying in a void promise.
export function useJobCommands(refetch: () => Promise<void>) {
  const stopRun = useCallback((project: string, id: string) => {
    StopJobRun(project, id).catch((err) => toast.error(errorText(err)));
  }, []);
  const toggleEnabled = useCallback(
    (project: string, id: string, enabled: boolean) => {
      SetJobEnabled(project, id, enabled)
        .catch((err) => toast.error(errorText(err)))
        .finally(() => void refetch());
    },
    [refetch],
  );
  return { runNow: runJobNow, stopRun, toggleEnabled };
}
