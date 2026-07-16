import { useEffect, useState } from "react";
import { DeleteJobHistory, JobHistory } from "../../../../bridge/commands";
import { Switch } from "../../ui/Switch";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import {
  ChevronLeftIcon,
  ClockIcon,
  PencilIcon,
  StopIcon,
  TrashIcon,
} from "../../icons";
import { PlayIcon } from "../icons";
import { useNow } from "../../../hooks/useNow";
import { JobRunRow } from "./JobRunRow";
import {
  formatNextRun,
  formatRunningFor,
  formatSchedule,
  groupJobThreads,
  jobThreadTail,
  type JobHistoryEntry,
  type JobInfo,
} from "../../../jobsFormat";

interface JobMessagesProps {
  project: string;
  job: JobInfo;
  refreshKey: number;
  onBack: () => void;
  onEdit: () => void;
  onRunNow: () => void;
  onStop: () => void;
  onRemove?: () => void;
  // The job's history changed from inside this page (a run was removed) —
  // lets the list behind it refresh its last-result line.
  onChanged?: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onOpenCopy: (project: string) => void;
  // Open one run's own page (its conversation), addressed by the run entry's
  // `at`.
  onOpenTask: (at: number) => void;
}

// A job's page: its runs, newest activity first — each run opens its own page
// with the conversation that grew out of it.
export function JobMessages({
  project,
  job,
  refreshKey,
  onBack,
  onEdit,
  onRunNow,
  onStop,
  onRemove,
  onChanged,
  onToggleEnabled,
  onOpenCopy,
  onOpenTask,
}: JobMessagesProps) {
  const [entries, setEntries] = useState<JobHistoryEntry[] | null>(null);
  // A run pending removal, awaiting confirmation.
  const [removing, setRemoving] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const now = useNow(job.running === true);

  useEffect(() => {
    let cancelled = false;
    JobHistory(project, job.id)
      .then((rows) => {
        if (!cancelled) setEntries((rows as JobHistoryEntry[]) ?? []);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [project, job.id, refreshKey, reload]);

  const removeRun = async () => {
    if (removing === null) return;
    const at = removing;
    setRemoving(null);
    try {
      await DeleteJobHistory(project, job.id, at, true);
    } finally {
      setReload((n) => n + 1);
      onChanged?.();
    }
  };

  const threads =
    entries === null
      ? null
      : groupJobThreads(entries).sort(
          (a, b) => jobThreadTail(b).at - jobThreadTail(a).at,
        );

  const scheduleText = job.schedule ? formatSchedule(job.schedule) : "";
  const nextRunText = job.enabled ? formatNextRun(job.nextFireAt) : "Paused";
  const meta = [project, scheduleText, nextRunText].filter(Boolean).join(" · ");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 pt-6">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to all jobs"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <ChevronLeftIcon />
        </button>
        <span className="grid h-8 w-8 shrink-0 place-items-center text-[17px] text-[var(--text-muted)]">
          {job.emoji || <ClockIcon size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {job.label || job.id}
          </h1>
          <p className="truncate text-[11px] text-[var(--text-muted)]">{meta}</p>
        </div>
        {job.running ? (
          <button
            type="button"
            onClick={onStop}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red)]"
          >
            <StopIcon />
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={onRunNow}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <PlayIcon />
            Run now
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <PencilIcon size={12} />
          Edit
        </button>
        {onRemove && job.source !== "repo" && (
          <button
            type="button"
            onClick={onRemove}
            title="Remove job"
            aria-label="Remove job"
            className="flex shrink-0 items-center rounded-md p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red)]"
          >
            <TrashIcon size={13} />
          </button>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={job.enabled}
          aria-label={job.enabled ? "Pause job" : "Resume job"}
          title={
            job.source === "global"
              ? job.enabled
                ? "Pause in this project only"
                : "Resume in this project only"
              : undefined
          }
          onClick={() => onToggleEnabled(!job.enabled)}
          className="shrink-0"
        >
          <Switch checked={job.enabled} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-6 pt-4">
        {!job.valid ? (
          <p className="py-10 text-center text-[12px] text-[var(--accent-red)]">
            {job.error || "This job can't run — edit it to fix its settings."}
          </p>
        ) : threads === null ? (
          <p className="py-10 text-center text-[12px] text-[var(--text-muted)]">
            Loading…
          </p>
        ) : threads.length === 0 && !job.running ? (
          <p className="py-10 text-center text-[12px] text-[var(--text-muted)]">
            No runs yet — use Run now to try it.
          </p>
        ) : (
          <div className="-mx-2">
            {job.running && (
              <div className="flex items-center gap-3 px-2 py-3">
                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--accent-cyan)]" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--accent-cyan)]">
                  {formatRunningFor(job.runningSince, now)}
                </span>
                <button
                  type="button"
                  onClick={onStop}
                  className="shrink-0 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--accent-red)]"
                >
                  Stop
                </button>
              </div>
            )}
            {threads.map((thread, i) => (
              <JobRunRow
                key={`${thread.root.at}-${i}`}
                thread={thread}
                onOpen={
                  thread.root.output || thread.replies.length > 0
                    ? () => onOpenTask(thread.root.at)
                    : undefined
                }
                onOpenCopy={onOpenCopy}
                onRemove={
                  job.running ? undefined : () => setRemoving(thread.root.at)
                }
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={removing !== null}
        title="Remove this run?"
        body="The run and its replies are removed from this job's history. This cannot be undone."
        confirmLabel="Remove"
        variant="destructive"
        onCancel={() => setRemoving(null)}
        onConfirm={() => void removeRun()}
      />
    </div>
  );
}
