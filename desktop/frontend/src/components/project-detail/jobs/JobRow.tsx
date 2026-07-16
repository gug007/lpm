import { Switch } from "../../ui/Switch";
import { ClockIcon, PencilIcon } from "../../icons";
import { PlayIcon } from "../icons";
import { relativeTime } from "../../../relativeTime";
import {
  formatNextRun,
  formatSchedule,
  isBlockedResult,
  jobResultLabel,
  jobResultTone,
  TONE_DOT_CLASS,
  type JobInfo,
} from "../../../jobsFormat";

const SOURCE_TAG: Record<string, string> = {
  global: "All projects",
  repo: "In repo",
};

interface JobRowProps {
  job: JobInfo;
  onRunNow: (id: string) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onOpen: (job: JobInfo) => void;
  onEdit: (job: JobInfo) => void;
}

export function JobRow({ job, onRunNow, onToggleEnabled, onOpen, onEdit }: JobRowProps) {
  const sourceTag = job.source ? SOURCE_TAG[job.source] : undefined;

  if (!job.valid) {
    return (
      <div className="group flex items-center gap-3 px-1 py-3">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-red)]" />
        <button
          type="button"
          onClick={() => onEdit(job)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">
            {job.label || job.id}
          </span>
          <span className="block truncate text-[12px] text-[var(--accent-red)]">
            {job.error || "This job can't run — open it to fix its settings."}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onEdit(job)}
          title="Edit"
          aria-label="Edit job"
          className="shrink-0 rounded-md p-2 text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          <PencilIcon size={13} />
        </button>
      </div>
    );
  }

  const enabled = job.enabled;
  const blocked = isBlockedResult(job.lastResult);
  const scheduleText = job.schedule ? formatSchedule(job.schedule) : "";
  const nextRunText = enabled ? formatNextRun(job.nextFireAt) : "";
  const lastRunText = job.lastRunAt
    ? relativeTime(job.lastRunAt) === "now"
      ? "just now"
      : `${relativeTime(job.lastRunAt)} ago`
    : "";
  const tone = jobResultTone(job.lastResult);

  return (
    <div className={`group flex items-center gap-3 px-1 py-3 ${enabled ? "" : "opacity-60"}`}>
      <span className="grid h-7 w-7 shrink-0 place-items-center text-[15px] text-[var(--text-muted)]">
        {job.emoji || <ClockIcon size={15} />}
      </span>

      <button
        type="button"
        onClick={() => onOpen(job)}
        className="min-w-0 flex-1 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-[13px] font-medium text-[var(--text-primary)]">
            {job.label || job.id}
          </span>
          {sourceTag && (
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {sourceTag}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
          {job.lastResult && (
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT_CLASS[tone]}`}
            />
          )}
          <span className="min-w-0 truncate">
            {blocked ? (
              <span className="text-[var(--accent-amber)]">
                Waiting — the copy from the last run is still open
              </span>
            ) : (
              [
                scheduleText,
                !enabled ? "Paused" : nextRunText,
                job.lastResult && lastRunText
                  ? `${jobResultLabel(job.lastResult)}, ${lastRunText}`
                  : "",
              ]
                .filter(Boolean)
                .join(" · ")
            )}
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => onRunNow(job.id)}
        title="Run now"
        aria-label="Run now"
        className="shrink-0 rounded-md p-2 text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:opacity-100 group-hover:opacity-100"
      >
        <PlayIcon />
      </button>

      <button
        type="button"
        onClick={() => onEdit(job)}
        title="Edit"
        aria-label="Edit job"
        className="shrink-0 rounded-md p-2 text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:opacity-100 group-hover:opacity-100"
      >
        <PencilIcon size={13} />
      </button>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={enabled ? "Pause job" : "Resume job"}
        onClick={() => onToggleEnabled(job.id, !enabled)}
        className="shrink-0"
      >
        <Switch checked={enabled} />
      </button>
    </div>
  );
}
