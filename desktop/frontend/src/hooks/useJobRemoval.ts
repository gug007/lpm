import { useState } from "react";
import { ClearJobState, StopJobRun } from "../../bridge/commands";
import { clearJobStateGlobal, deleteJob, deleteJobGlobal } from "../jobsConfig";
import type { JobInfo } from "../jobsFormat";
import { toast } from "../notifications/toast";
import { peerAlias, type PeerClient } from "../peer/usePeerState";

// The automation waiting on the "Remove?" dialog, and removing it once confirmed.
export function useJobRemoval<T extends JobInfo>(
  peers: PeerClient[],
  rows: T[],
  rowProjectOf: (job: T) => string,
  refetch: () => Promise<void>,
) {
  const [removing, setRemoving] = useState<{ project: string; job: T } | null>(null);

  const remove = async (deleteCopies: boolean) => {
    if (!removing) return;
    const { project, job } = removing;
    setRemoving(null);
    const peer = job.host ? peers.find((p) => p.slug === job.host) : undefined;
    if (job.source === "global" && job.host && !peer?.supportsHostJobs) {
      toast.error(`Update lpm on ${peerAlias(peers, job.host)} to remove its shared automations from here.`);
      return;
    }
    try {
      void StopJobRun(project, job.id);
      if (job.source === "global") {
        await deleteJobGlobal(job.id, job.host);
        await clearJobStateGlobal(job.id, deleteCopies, job.host);
      } else {
        await deleteJob(project, job.id);
        await ClearJobState(project, job.id, deleteCopies);
      }
      toast.success("Automation removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      void refetch();
    }
  };

  // Whether the job on the removal block has a run alive anywhere — a global
  // job rows under every project, and a copy can't be deleted under a live
  // run (the backend refuses too; this keeps the dialog honest up front).
  const running = removing
    ? rows.some(
        (r) =>
          r.id === removing.job.id &&
          r.running === true &&
          rowProjectOf(r) === rowProjectOf(removing.job),
      )
    : false;

  return { removing, setRemoving, running, remove };
}
