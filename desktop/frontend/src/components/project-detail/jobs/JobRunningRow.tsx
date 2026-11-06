import { formatRunningFor, jobRunStep, type JobInfo } from "../../../jobsFormat";
import { JobLiveOutput } from "./JobLiveOutput";
import { JobTakeOverButton } from "./JobTakeOverButton";

const ACTION_CLASS =
  "shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50";

interface JobRunningRowProps {
  project: string;
  job: JobInfo;
  now: number;
  onStop: () => void;
  onOpenCopy: (project: string) => void;
}

// The run in progress at the top of a job's page: how long it has been going,
// what it is doing and where, what it has said so far, and how to step in.
export function JobRunningRow({ project, job, now, onStop, onOpenCopy }: JobRunningRowProps) {
  const copy = job.runningIn;
  const step = jobRunStep(job);

  return (
    <div className="flex items-start gap-3 py-3 pl-1 pr-3">
      <span className="w-2.5 shrink-0" />
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--bg-hover)]">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent-cyan)]" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-[var(--accent-cyan-text)]">
            {formatRunningFor(job.runningSince, now)}
          </span>
          {job.takeOverIn && (
            <JobTakeOverButton
              project={job.takeOverIn}
              jobId={job.id}
              className={`${ACTION_CLASS} hover:text-[var(--text-primary)]`}
            />
          )}
          <button
            type="button"
            onClick={onStop}
            className={`${ACTION_CLASS} hover:text-[var(--accent-red)]`}
          >
            Stop
          </button>
        </div>
        {step && <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{step}…</p>}
        {copy && (
          <p className="mt-0.5 truncate text-[13px] text-[var(--text-muted)]">
            {"Working in "}
            <button
              type="button"
              onClick={() => onOpenCopy(copy)}
              title="Open the copy this run works in"
              className="font-medium text-[var(--accent-cyan)] hover:underline"
            >
              {job.runningInName}
            </button>
          </p>
        )}
        <div className="mt-2">
          <JobLiveOutput
            project={project}
            jobId={job.id}
            running={job.running === true && !step}
            placeholder="No output yet."
          />
        </div>
      </div>
    </div>
  );
}
