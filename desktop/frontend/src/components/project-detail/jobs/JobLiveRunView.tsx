import { useEffect, useRef, useState } from "react";
import { JobHistory } from "../../../../bridge/commands";
import type { ContentZoom } from "../../../hooks/useContentZoom";
import { useNow } from "../../../hooks/useNow";
import { runningRunAsks } from "../../../jobLive";
import {
  formatRunningFor,
  groupJobThreads,
  jobRunStep,
  jobThreadTail,
  type JobHistoryEntry,
  type JobInfo,
} from "../../../jobsFormat";
import { clockLabel } from "../../../sendLater/time";
import { JobAskCards } from "./JobAskCards";
import { JobLiveConversation } from "./JobLiveConversation";
import { JobRunPageHeader } from "./JobRunPageHeader";
import { JobStopButton } from "./JobStopButton";
import { JobTakeOverButton } from "./JobTakeOverButton";
import { useFollowBottom } from "./useFollowBottom";

interface JobLiveRunViewProps {
  project: string;
  job: JobInfo;
  zoom: ContentZoom;
  onBack: () => void;
  onStop: () => void;
  // The run ended: open the conversation it landed in, by its root's `at`.
  onLanded: (rootAt: number) => void;
}

// The run still going, as its own page: everything the agent has said so far,
// its steps folded, and the question it asked at the end, where it's answered.
// Watching it changes nothing; taking it over is the one way to step in. Once
// it ends, the page becomes the conversation it landed in.
export function JobLiveRunView({ project, job, zoom, onBack, onStop, onLanded }: JobLiveRunViewProps) {
  const now = useNow(job.running === true);
  const [startedAt] = useState(job.runningSince ?? 0);
  // Kept current without restarting the landing lookup on every redraw.
  const leave = useRef({ onLanded, onBack });
  leave.current = { onLanded, onBack };
  const page = useFollowBottom(zoom.surfaceRef);
  const step = jobRunStep(job);

  useEffect(() => {
    if (job.running) return;
    let cancelled = false;
    JobHistory(project, job.id)
      .then((rows) => {
        if (cancelled) return;
        const landed = groupJobThreads((rows as JobHistoryEntry[]) ?? [])
          .filter((t) => jobThreadTail(t).at >= startedAt)
          .sort((a, b) => jobThreadTail(b).at - jobThreadTail(a).at)[0];
        if (landed) leave.current.onLanded(landed.root.at);
        else leave.current.onBack();
      })
      .catch(() => {
        if (!cancelled) leave.current.onBack();
      });
    return () => {
      cancelled = true;
    };
  }, [job.running, project, job.id, startedAt]);

  const meta = [
    startedAt ? `Run started ${clockLabel(startedAt * 1000)}` : "",
    job.running ? formatRunningFor(job.runningSince, now) : "Finished",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <JobRunPageHeader job={job} meta={meta} zoom={zoom} onBack={onBack}>
        {job.running && job.takeOverIn && (
          <JobTakeOverButton
            project={job.takeOverIn}
            jobId={job.id}
            className="flex shrink-0 items-center rounded-md px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
          />
        )}
        {job.running && <JobStopButton onStop={onStop} />}
      </JobRunPageHeader>

      <div
        ref={page.ref}
        onScroll={page.onScroll}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-6 pt-5"
      >
        <div className="flex flex-col gap-3" style={{ zoom: zoom.zoom }}>
          {step && <p className="text-[12.5px] text-[var(--text-muted)]">{step}…</p>}
          <JobLiveConversation
            project={project}
            jobId={job.id}
            running={job.running === true && !step}
            onGrow={page.follow}
          />
          <JobAskCards asks={runningRunAsks(job, project)} project={project} jobId={job.id} />
        </div>
      </div>
    </div>
  );
}
