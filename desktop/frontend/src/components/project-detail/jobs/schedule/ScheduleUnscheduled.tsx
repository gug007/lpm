import { PlayIcon } from "../../icons";
import {
  formatSchedule,
  jobResultLabel,
  jobResultTone,
  TONE_DOT_CLASS,
  type JobInfo,
} from "../../../../jobsFormat";
import { relativeTime } from "../../../../relativeTime";
import { jobName } from "../../../../scheduleBoard";

type BoardJob = JobInfo & { project?: string };

interface ScheduleUnscheduledProps {
  jobs: BoardJob[];
  dense: BoardJob[];
  scopeLabelFor: (job: BoardJob) => string;
  onOpen: (job: BoardJob) => void;
  onRunNow: (job: BoardJob) => void;
}

const PANEL =
  "min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]";
const HEADING =
  "flex items-baseline gap-2 border-b border-[var(--border)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]";
const HEADING_COUNT =
  "text-[11px] font-normal normal-case tracking-normal tabular-nums text-[var(--text-muted)]";
const ROW =
  "flex min-h-[38px] w-full items-center gap-2.5 border-b border-[var(--border)] px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-[var(--bg-hover)]";
const NAME = "min-w-0 shrink truncate text-[13px] font-medium text-[var(--text-primary)]";
const SCOPE = "shrink-0 truncate text-[11px] text-[var(--text-muted)]";
const META =
  "mt-0.5 flex items-center gap-1.5 text-[11px] tabular-nums text-[var(--text-muted)]";
const META_LINE = "mt-0.5 block truncate text-[11px] tabular-nums text-[var(--text-muted)]";

function ageLabel(atSecs: number): string {
  const age = relativeTime(atSecs);
  return age === "now" ? "just now" : `${age} ago`;
}

export function ScheduleUnscheduled({
  jobs,
  dense,
  scopeLabelFor,
  onOpen,
  onRunNow,
}: ScheduleUnscheduledProps) {
  if (jobs.length === 0 && dense.length === 0) return null;

  return (
    <section className={PANEL}>
      <h3 className={HEADING}>
        Not on the board
        <span className={HEADING_COUNT}>
          {jobs.length + dense.length}{" "}
          {jobs.length + dense.length === 1 ? "job" : "jobs"}
        </span>
      </h3>

      {jobs.map((job) =>
        job.valid ? (
          <div key={`job/${job.id}`} className={ROW}>
            <button
              type="button"
              onClick={() => onOpen(job)}
              title={`${jobName(job)} — open`}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  {job.emoji && <span className="shrink-0 text-[12px]">{job.emoji}</span>}
                  <span className={NAME}>{jobName(job)}</span>
                  <span className={SCOPE}>{scopeLabelFor(job)}</span>
                </span>
                <span className={META}>
                  {job.lastResult && (
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT_CLASS[jobResultTone(job.lastResult)]}`}
                    />
                  )}
                  <span className="min-w-0 truncate">
                    {job.lastResult && job.lastRunAt
                      ? `${jobResultLabel(job.lastResult)}, ${ageLabel(job.lastRunAt)}`
                      : "Never run"}
                  </span>
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onRunNow(job)}
              title="Run now"
              aria-label={`Run ${jobName(job)} now`}
              className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <PlayIcon />
              Run now
            </button>
          </div>
        ) : (
          <button
            key={`job/${job.id}`}
            type="button"
            onClick={() => onOpen(job)}
            title={job.error || "This job can't run — open it to fix its settings."}
            className={ROW}
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-red)]"
            />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-baseline gap-1.5">
                {job.emoji && <span className="shrink-0 text-[12px]">{job.emoji}</span>}
                <span className={NAME}>{jobName(job)}</span>
                <span className={SCOPE}>{scopeLabelFor(job)}</span>
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-[var(--accent-red-text)]">
                {job.error || "This job can't run — open it to fix its settings."}
              </span>
            </span>
          </button>
        ),
      )}

      {dense.map((job) => (
        <button
          key={`dense/${job.id}`}
          type="button"
          onClick={() => onOpen(job)}
          title={`${jobName(job)} — runs too often to place on a week board`}
          className={ROW}
        >
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-baseline gap-1.5">
              {job.emoji && <span className="shrink-0 text-[12px]">{job.emoji}</span>}
              <span className={NAME}>{jobName(job)}</span>
              <span className={SCOPE}>{scopeLabelFor(job)}</span>
            </span>
            <span className={META_LINE}>
              {job.schedule ? `${formatSchedule(job.schedule)} — ` : ""}too frequent to chart
            </span>
          </span>
        </button>
      ))}
    </section>
  );
}
