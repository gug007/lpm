import { useEffect, useState } from "react";
import { hasOnOffSwitch } from "../../../jobsList";
import { toast } from "../../../notifications/toast";
import { DeleteJobHistory, JobHistory } from "../../../../bridge/commands";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { ZoomControl } from "../../ui/ZoomControl";
import type { ContentZoom } from "../../../hooks/useContentZoom";
import {
  ChevronLeftIcon,
  ClockIcon,
  PencilIcon,
  TrashIcon,
} from "../../icons";
import { PlayIcon } from "../icons";
import { useNow } from "../../../hooks/useNow";
import { useAppStore } from "../../../store/app";
import { displayNameForProjectName } from "../../ProjectNameDisplay";
import { stripMarker } from "../../../peer/markers";
import { peerAlias, usePeerState } from "../../../peer/usePeerState";
import { JobRunRow } from "./JobRunRow";
import { JobRunningRow } from "./JobRunningRow";
import { JobOffBanner } from "./JobOffBanner";
import { JobOnOffToggle } from "./JobOnOffToggle";
import { JobAskCards } from "./JobAskCards";
import { JobStopButton } from "./JobStopButton";
import { askWaitingIn, holdsJob, waitingAsks } from "../../../jobAsk";
import { runningRunAsks } from "../../../jobLive";
import {
  formatNextRun,
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
  // Reader zoom, shared with the rest of the Automations section.
  zoom: ContentZoom;
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
  // Open the run still going, which streams in its own page.
  onOpenLive: () => void;
  // Opening a run reads it, and everything under it — the runs that landed
  // after it stay new. Merely opening this page reads nothing, so the list keeps
  // pointing at what still hasn't been looked at.
  onSeenUpTo: (at: number) => void;
}

// A job's page: its runs, newest activity first — each run opens its own page
// with the conversation that grew out of it.
export function JobMessages({
  project,
  job,
  refreshKey,
  zoom,
  onBack,
  onEdit,
  onRunNow,
  onStop,
  onRemove,
  onChanged,
  onToggleEnabled,
  onOpenCopy,
  onOpenTask,
  onOpenLive,
  onSeenUpTo,
}: JobMessagesProps) {
  const [entries, setEntries] = useState<JobHistoryEntry[] | null>(null);
  // A run pending removal, awaiting confirmation.
  const [removing, setRemoving] = useState<number | null>(null);
  const [removeCopy, setRemoveCopy] = useState(false);
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

  const threads =
    entries === null
      ? null
      : groupJobThreads(entries).sort(
          (a, b) => jobThreadTail(b).at - jobThreadTail(a).at,
        );

  // The copy the to-be-removed run worked in, offered for removal with it.
  const removingThread =
    removing !== null ? threads?.find((t) => t.root.at === removing) : undefined;
  const removingCopy = removingThread
    ? [removingThread.root, ...removingThread.replies].find((e) => e.copy)?.copy
    : undefined;

  const removeRun = async () => {
    if (removing === null) return;
    const at = removing;
    const alsoCopy = removeCopy && !!removingCopy;
    setRemoving(null);
    try {
      await DeleteJobHistory(project, job.id, at, true, alsoCopy);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setReload((n) => n + 1);
      onChanged?.();
    }
  };

  const storeProjects = useAppStore((s) => s.projects);
  const scheduleText = job.schedule ? formatSchedule(job.schedule) : "";
  const nextRunText = job.enabled ? formatNextRun(job.nextFireAt) : "Off";
  const { state: peerState } = usePeerState();
  // A standalone job of a paired machine's is that machine's sentinel, not a project.
  const projectLabel = stripMarker(project) ? displayNameForProjectName(project, storeProjects) : "";
  const machineLabel = job.host ? peerAlias(peerState.peers, job.host) : "";
  const meta = [projectLabel, machineLabel, scheduleText, nextRunText].filter(Boolean).join(" · ");
  const allWaiting = waitingAsks(job).filter((ask) => askWaitingIn(ask, project));
  const held = allWaiting.some(holdsJob);
  // The run still going shows its own question; the rest wait up here.
  const ownedByRun = new Set(runningRunAsks(job, project).map((ask) => ask.id));
  const waiting = allWaiting.filter((ask) => !ownedByRun.has(ask.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="@container flex flex-wrap items-center gap-x-3 gap-y-2 pt-6">
        <div className="flex min-w-48 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to all automations"
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
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 @max-md:gap-x-1">
          <ZoomControl
            percent={zoom.percent}
            onZoomIn={zoom.zoomIn}
            onZoomOut={zoom.zoomOut}
            onReset={zoom.zoomReset}
            canZoomIn={zoom.canZoomIn}
            canZoomOut={zoom.canZoomOut}
          />
          {job.running ? (
            <JobStopButton onStop={onStop} />
          ) : (
            <button
              type="button"
              onClick={onRunNow}
              disabled={!job.enabled || held}
              title={
                held
                  ? "Answer or skip its question first"
                  : job.enabled
                    ? undefined
                    : "Turn it on to run it"
              }
              className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors enabled:hover:bg-[var(--bg-hover)] enabled:hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
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
              title="Remove automation"
              aria-label="Remove automation"
              className="flex shrink-0 items-center rounded-md p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red)]"
            >
              <TrashIcon size={13} />
            </button>
          )}
          {hasOnOffSwitch(job) && (
            <JobOnOffToggle
              label={job.label || job.id}
              enabled={job.enabled}
              onToggle={onToggleEnabled}
            />
          )}
        </div>
      </div>

      <div
        ref={zoom.surfaceRef}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-6 pt-4"
      >
        {job.valid && !job.enabled && <JobOffBanner onTurnOn={() => onToggleEnabled(true)} />}
        <JobAskCards asks={waiting} project={project} jobId={job.id} className="mb-4" style={{ zoom: zoom.zoom }} />
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
            {job.enabled ? "No runs yet — use Run now to try it." : "No runs yet."}
          </p>
        ) : (
          <div className="-mx-1 flex flex-col" style={{ zoom: zoom.zoom }}>
            {job.running && (
              <JobRunningRow
                project={project}
                job={job}
                now={now}
                onStop={onStop}
                onOpenCopy={onOpenCopy}
                onOpen={onOpenLive}
              />
            )}
            {threads.map((thread, i) => (
              <JobRunRow
                key={`${thread.root.at}-${i}`}
                thread={thread}
                onOpen={
                  thread.root.output || thread.replies.length > 0
                    ? () => {
                        onSeenUpTo(jobThreadTail(thread).at);
                        onOpenTask(thread.root.at);
                      }
                    : undefined
                }
                onOpenCopy={onOpenCopy}
                onRemove={
                  job.running
                    ? undefined
                    : () => {
                        setRemoveCopy(false);
                        setRemoving(thread.root.at);
                      }
                }
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={removing !== null}
        title="Remove this run?"
        body={
          <>
            The run and its replies are removed from this job's history. This
            cannot be undone.
            {removingCopy && (
              <label className="mt-3 flex cursor-pointer items-center gap-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={removeCopy}
                  onChange={(e) => setRemoveCopy(e.target.checked)}
                  className="accent-[var(--accent-blue)] h-3 w-3"
                />
                Also remove {displayNameForProjectName(removingCopy, storeProjects)}, the copy it worked in
              </label>
            )}
          </>
        }
        confirmLabel="Remove"
        variant="destructive"
        onCancel={() => setRemoving(null)}
        onConfirm={() => void removeRun()}
      />
    </div>
  );
}
