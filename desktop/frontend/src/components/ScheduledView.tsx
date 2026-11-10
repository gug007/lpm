import { useCallback, useEffect, useState } from "react";
import { toast } from "../notifications/toast";
import { EventsOn } from "../../bridge/runtime";
import {
  ListAllJobs,
  MarkAllJobsSeen,
  MarkJobSeen,
} from "../../bridge/commands";
import { useAppStore } from "../store/app";
import { useContentZoom } from "../hooks/useContentZoom";
import { useJobCommands } from "../hooks/useJobCommands";
import { useAutomationOpenRequest } from "../hooks/useAutomationOpenRequest";
import { useJobScopeLabel } from "../hooks/useJobScopeLabel";
import { useJobRemoval } from "../hooks/useJobRemoval";
import { AutomationsPlaceholder } from "./AutomationsPlaceholder";
import { AutomationsHeader, type AutomationsViewMode } from "./AutomationsHeader";
import { useFailedFilter } from "./project-detail/jobs/useFailedFilter";
import { usePeerState } from "../peer/usePeerState";
import type { JobInfo } from "../jobsFormat";
import {
  isUnread,
  rowProject,
  sortJobsForList,
  targetsOfRow,
} from "../jobsList";
import type { ScheduledJob } from "../hooks/useJobs";
import { displayNameForProjectName } from "./ProjectNameDisplay";
import { JobListSections } from "./project-detail/jobs/JobListSections";
import { JobOfflineGroups } from "./project-detail/jobs/JobOfflineGroups";
import { JobMessages } from "./project-detail/jobs/JobMessages";
import { JobTaskView } from "./project-detail/jobs/JobTaskView";
import { JobLiveRunView } from "./project-detail/jobs/JobLiveRunView";
import { JobDialogs, type JobEditing } from "./project-detail/jobs/JobDialogs";
import { ScheduleWeekView } from "./project-detail/jobs/schedule/ScheduleWeekView";

// One reader zoom for the whole section — the list, a job's runs, and a run's
// conversation all read at the level the user last picked.
const ZOOM_KEY = "lpm.automations-zoom";
const VIEW_KEY = "lpm.automations-view";

function storedView(): AutomationsViewMode {
  return localStorage.getItem(VIEW_KEY) === "week" ? "week" : "list";
}

interface ScheduledViewProps {
  // A project's Automations tab: only the jobs that run in it, and a new job
  // starts scoped to it. Absent = the app-wide page, every job.
  project?: string;
  // A hidden tab stops refetching on every run, and only the focused pane's
  // tab takes ⌘+ / ⌘−.
  visible?: boolean;
  focused?: boolean;
}

export function ScheduledView({ project, visible = true, focused = true }: ScheduledViewProps) {
  const projects = useAppStore((s) => s.projects);
  const selectProject = useAppStore((s) => s.selectProject);
  const { state: peerState } = usePeerState();
  const [rows, setRows] = useState<ScheduledJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<JobEditing>(null);
  const [open, setOpen] = useState<{ project: string; id: string } | null>(null);
  // The run page open inside the job page: a run entry's `at`, or the run
  // still going.
  const [openRun, setOpenRun] = useState<number | "live" | null>(null);
  // A multi-project job awaiting the "which projects?" pick before a manual run.
  const [runPick, setRunPick] = useState<ScheduledJob | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [view, setView] = useState<AutomationsViewMode>(storedView);
  const selectView = (next: AutomationsViewMode) => {
    setView(next);
    localStorage.setItem(VIEW_KEY, next);
  };
  // The job editor has its own text surfaces, so it takes ⌘+/⌘− back while open.
  const zoom = useContentZoom(visible && focused && editing === null, ZOOM_KEY);

  const refetch = useCallback(async () => {
    try {
      const result = (await ListAllJobs()) as ScheduledJob[];
      setRows(Array.isArray(result) ? result : []);
      setError(null);
      setRefreshKey((n) => n + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : String(err),
      );
      setRows((prev) => prev ?? []);
    }
  }, []);

  const { runNow, stopRun, toggleEnabled } = useJobCommands(refetch);

  // A computer coming or going changes which copy of an automation shows, so a
  // gone one's row doesn't linger in place of this one's.
  const connectedPeers = peerState.peers
    .filter((p) => p.connected)
    .map((p) => p.slug)
    .join(" ");
  useEffect(() => {
    if (!visible) return;
    void refetch();
    const cancel = EventsOn("job-status", () => void refetch());
    return () => {
      if (typeof cancel === "function") cancel();
    };
  }, [visible, refetch, connectedPeers]);

  // In a project's tab a shared job opens on this project's own runs.
  const rowProjectOf = useCallback(
    (job: ScheduledJob) => project ?? rowProject(job),
    [project],
  );

  useAutomationOpenRequest(project ?? null, visible, rows, refetch, (job, target) => {
    setOpenRun(null);
    setOpen({ project: target ?? rowProject(job), id: job.id });
  });

  // Row buttons act on every folder the job runs in, so a shared job's Stop /
  // pause reach all of its projects at once.
  // A manual run in a job with more than one project first asks which to run;
  // a single-project or standalone job runs straight away.
  const runNowJob = (job: ScheduledJob) => {
    const targets = targetsOfRow(job).filter((p) => p !== "");
    if (targets.length > 1) {
      setRunPick(job);
    } else {
      targetsOfRow(job).forEach((p) => runNow(p, job.id));
    }
  };
  const stopRunJob = (job: JobInfo) =>
    targetsOfRow(job).forEach((p) => stopRun(p, job.id));
  const toggleEnabledJob = (job: JobInfo, enabled: boolean) =>
    targetsOfRow(job).forEach((p) => toggleEnabled(p, job.id, enabled));

  // Opening a run reads that run and everything before it, in every folder the
  // job runs in — the row folds them into one unread count.
  const markSeenJob = async (job: ScheduledJob, at?: number) => {
    await Promise.all(
      targetsOfRow(job).map((p) => MarkJobSeen(p, job.id, at).catch(() => {})),
    );
    void refetch();
  };

  // One flat feed: everything unread first, newest activity first inside each
  // half — the project each job runs in rides on the row itself.
  // In a project's tab, a shared job's question from another of its projects
  // isn't this one's to answer.
  const shown = project
    ? (rows ?? [])
        .filter((row) => targetsOfRow(row).includes(project))
        .map((row) => {
          const asks = row.asks?.filter((ask) => ask.project === project);
          const ask = row.ask && row.ask.project !== project ? asks?.[0] : row.ask;
          return { ...row, ask, asks };
        })
    : rows ?? [];
  // A computer that isn't answering lists what it said last; those rows wait
  // in their own group and nothing acts on them until it's back.
  const live = shown.filter((row) => !row.offline);
  const removal = useJobRemoval(peerState.peers, shown, rowProjectOf, refetch);
  const sorted = sortJobsForList(live);
  const unreadRows = sorted.filter(isUnread);
  const failed = useFailedFilter(sorted);
  const unreadCount = unreadRows.length;
  const projectLabel = useCallback(
    (name: string) => displayNameForProjectName(name, projects),
    [projects],
  );
  const scopeLabelFor = useJobScopeLabel(projects, projectLabel, peerState);
  // Stable so the board's memoised layout survives a render that changed
  // nothing about the jobs themselves.
  const rowKeyOf = useCallback(
    (job: ScheduledJob) => `${rowProject(job)}/${job.id}`,
    [],
  );

  const markAllSeen = async () => {
    try {
      if (project) {
        await Promise.all(
          unreadRows.flatMap((job) => targetsOfRow(job).map((p) => MarkJobSeen(p, job.id))),
        );
      } else {
        await MarkAllJobsSeen();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      void refetch();
    }
  };

  const actionsFor = (project: string) =>
    projects.find((p) => p.name === project)?.actions ?? [];

  // Every job id in use (null = anywhere) — so a new job never silently takes
  // over an id another config layer already uses.
  const knownIds = (project: string | null) =>
    (rows ?? [])
      .filter((r) => project === null || r.project === project)
      .map((r) => r.id);

  // A job waiting on a question opens where it's waiting.
  const openJobPage = (job: ScheduledJob) =>
    setOpen({ project: project ?? job.ask?.project ?? rowProject(job), id: job.id });
  const editJob = (job: ScheduledJob) =>
    setEditing({ mode: "edit", project: rowProjectOf(job), job });
  const removeJobRow = (job: ScheduledJob) =>
    removal.setRemoving({ project: rowProjectOf(job), job });
  const newJob = () => setEditing({ mode: "new", project });


  // A shared job opens on any of its projects' runs, not only its first.
  const openJob = open
    ? live.find(
        (r) =>
          r.id === open.id &&
          (rowProjectOf(r) === open.project || targetsOfRow(r).includes(open.project)),
      )
    : undefined;
  useEffect(() => {
    if (open && rows !== null && !openJob) {
      setOpen(null);
      setOpenRun(null);
    }
  }, [open, rows, openJob]);

  // The list and a job's own page raise the same dialogs.
  const dialogs = (
    <JobDialogs
      projects={projects}
      editing={editing}
      onCloseEditor={() => setEditing(null)}
      onSaved={() => void refetch()}
      actionsFor={actionsFor}
      knownIds={knownIds}
      removing={removal.removing}
      removingRunning={removal.running}
      onCancelRemove={() => removal.setRemoving(null)}
      onConfirmRemove={(deleteCopies) => void removal.remove(deleteCopies)}
      runPick={runPick}
      onCancelRunPick={() => setRunPick(null)}
      onRunPicked={(selected) => {
        const job = runPick;
        setRunPick(null);
        if (job) selected.forEach((p) => runNow(p, job.id));
      }}
    />
  );

  if (open && openJob && openRun === "live") {
    return (
      <JobLiveRunView
        project={open.project}
        job={openJob}
        zoom={zoom}
        onBack={() => setOpenRun(null)}
        onStop={() => stopRun(open.project, openJob.id)}
        onLanded={setOpenRun}
      />
    );
  }

  if (open && openJob && typeof openRun === "number") {
    return (
      <JobTaskView
        project={open.project}
        job={openJob}
        rootAt={openRun}
        refreshKey={refreshKey}
        zoom={zoom}
        onBack={() => setOpenRun(null)}
        onStop={() => stopRun(open.project, openJob.id)}
        onChanged={() => void refetch()}
        onOpenCopy={(name) => selectProject(name)}
      />
    );
  }

  if (open && openJob) {
    return (
      <>
        <JobMessages
          project={open.project}
          job={openJob}
          refreshKey={refreshKey}
          zoom={zoom}
          onBack={() => setOpen(null)}
          onEdit={() =>
            setEditing({ mode: "edit", project: open.project, job: openJob })
          }
          onRunNow={() => runNowJob(openJob)}
          onStop={() => stopRunJob(openJob)}
          onRemove={() => removal.setRemoving({ project: open.project, job: openJob })}
          onChanged={() => void refetch()}
          onToggleEnabled={(enabled) => toggleEnabledJob(openJob, enabled)}
          onOpenCopy={(name) => selectProject(name)}
          onOpenTask={setOpenRun}
          onOpenLive={() => setOpenRun("live")}
          onSeenUpTo={(at) => void markSeenJob(openJob, at)}
        />
        {dialogs}
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AutomationsHeader
        scoped={project !== undefined}
        hasJobs={shown.length > 0}
        unreadCount={unreadCount}
        view={view}
        onViewChange={selectView}
        failedCount={failed.count}
        failedOnly={failed.active}
        onToggleFailed={failed.toggle}
        zoom={zoom}
        onMarkAllSeen={() => void markAllSeen()}
        onNewJob={newJob}
      />

      <div
        ref={zoom.surfaceRef}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-6 pt-4"
      >
        {shown.length === 0 ? (
          <AutomationsPlaceholder
            error={error}
            loading={rows === null}
            scoped={project !== undefined}
            onRetry={() => void refetch()}
            onNewJob={newJob}
          />
        ) : (
          <>
            {error && (
              <p className="mb-3 rounded-lg bg-[color-mix(in_srgb,var(--accent-red)_12%,var(--bg-primary))] px-3 py-2 text-[11px] leading-snug text-[var(--accent-red-text)]">
                Couldn't refresh scheduled jobs: {error}
              </p>
            )}
            {view === "week" ? (
              <div className="min-w-0" style={{ zoom: zoom.zoom }}>
                <ScheduleWeekView
                  jobs={sorted}
                  scopeLabelFor={scopeLabelFor}
                  keyOf={rowKeyOf}
                  projectLabel={projectLabel}
                  onOpen={openJobPage}
                  onRunNow={runNowJob}
                  onStop={stopRunJob}
                />
              </div>
            ) : (
              <JobListSections
                unreadRows={failed.rows.filter(isUnread)}
                readRows={failed.rows.filter((row) => !isUnread(row))}
                zoom={zoom.zoom}
                scopeLabelFor={scopeLabelFor}
                rowKeyOf={rowKeyOf}
                onRunNow={runNowJob}
                onStop={stopRunJob}
                onToggleEnabled={toggleEnabledJob}
                onOpen={openJobPage}
                onEdit={editJob}
                onRemove={removeJobRow}
              />
            )}
            <JobOfflineGroups
              rows={shown}
              peers={peerState.peers}
              scopeLabelFor={scopeLabelFor}
              zoom={zoom.zoom}
            />
          </>
        )}
      </div>

      {dialogs}
    </div>
  );
}
