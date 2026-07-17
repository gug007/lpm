import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { EventsOn } from "../../bridge/runtime";
import {
  ClearJobState,
  ClearJobStateGlobal,
  ListAllJobs,
  RunJobNow,
  SetJobEnabled,
  StopJobRun,
} from "../../bridge/commands";
import { useAppStore } from "../store/app";
import { ClockIcon, PlusIcon } from "./icons";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { deleteJob, deleteJobGlobal } from "../jobsConfig";
import type { JobInfo } from "../jobsFormat";
import { JobRow } from "./project-detail/jobs/JobRow";
import { JobMessages } from "./project-detail/jobs/JobMessages";
import { JobTaskView } from "./project-detail/jobs/JobTaskView";
import { JobEditorModal } from "./project-detail/jobs/JobEditorModal";

type ScheduledJob = JobInfo & { project: string };

type Editing = { mode: "new" } | { mode: "edit"; project: string; job: JobInfo } | null;

export function ScheduledView() {
  const projects = useAppStore((s) => s.projects);
  const selectProject = useAppStore((s) => s.selectProject);
  const [rows, setRows] = useState<ScheduledJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [open, setOpen] = useState<{ project: string; id: string } | null>(null);
  // The run page open inside the job page — a run entry's `at`.
  const [openTask, setOpenTask] = useState<number | null>(null);
  const [removing, setRemoving] = useState<{ project: string; job: JobInfo } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

  // Row buttons fire-and-forget; a rejection (invalid job, gone project) must
  // still reach the user instead of dying in a void promise.
  const runNow = useCallback((project: string, id: string) => {
    RunJobNow(project, id).catch((err) => {
      toast.error(
        err instanceof Error ? err.message : String(err),
      );
    });
  }, []);
  const stopRun = useCallback((project: string, id: string) => {
    StopJobRun(project, id).catch((err) => {
      toast.error(
        err instanceof Error ? err.message : String(err),
      );
    });
  }, []);
  const toggleEnabled = useCallback(
    (project: string, id: string, enabled: boolean) => {
      SetJobEnabled(project, id, enabled)
        .catch((err) => {
          toast.error(
            err instanceof Error ? err.message : String(err),
          );
        })
        .finally(() => void refetch());
    },
    [refetch],
  );

  useEffect(() => {
    void refetch();
    const cancel = EventsOn("job-status", () => void refetch());
    return () => {
      if (typeof cancel === "function") cancel();
    };
  }, [refetch]);

  const groups = new Map<string, ScheduledJob[]>();
  for (const row of rows ?? []) {
    const list = groups.get(row.project) ?? [];
    list.push(row);
    groups.set(row.project, list);
  }

  const actionsFor = (project: string) =>
    projects.find((p) => p.name === project)?.actions ?? [];

  // Every job id visible for a project (null = anywhere) — so a new job never
  // silently takes over an id another config layer already uses.
  const knownIds = (project: string | null) =>
    (rows ?? [])
      .filter((r) => project === null || r.project === project)
      .map((r) => r.id);

  const removeJob = async (deleteCopies: boolean) => {
    if (!removing) return;
    const { project, job } = removing;
    setRemoving(null);
    try {
      void StopJobRun(project, job.id);
      if (job.source === "global") {
        await deleteJobGlobal(job.id);
        await ClearJobStateGlobal(job.id, deleteCopies);
      } else {
        await deleteJob(project, job.id);
        await ClearJobState(project, job.id, deleteCopies);
      }
      toast.success("Job removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      void refetch();
    }
  };

  // Whether the job on the removal block has a run alive anywhere — a global
  // job rows under every project, and a copy can't be deleted under a live
  // run (the backend refuses too; this keeps the dialog honest up front).
  const removingRunning = removing
    ? (rows ?? []).some(
        (r) =>
          r.id === removing.job.id &&
          r.running === true &&
          (removing.job.source === "global" || r.project === removing.project),
      )
    : false;

  const openJob = open
    ? (rows ?? []).find((r) => r.project === open.project && r.id === open.id)
    : undefined;
  useEffect(() => {
    if (open && rows !== null && !openJob) {
      setOpen(null);
      setOpenTask(null);
    }
  }, [open, rows, openJob]);

  if (open && openJob && openTask !== null) {
    return (
      <JobTaskView
        project={open.project}
        job={openJob}
        rootAt={openTask}
        refreshKey={refreshKey}
        onBack={() => setOpenTask(null)}
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
          onBack={() => setOpen(null)}
          onEdit={() =>
            setEditing({ mode: "edit", project: open.project, job: openJob })
          }
          onRunNow={() => runNow(open.project, openJob.id)}
          onStop={() => stopRun(open.project, openJob.id)}
          onRemove={() => setRemoving({ project: open.project, job: openJob })}
          onChanged={() => void refetch()}
          onToggleEnabled={(enabled) =>
            toggleEnabled(open.project, openJob.id, enabled)
          }
          onOpenCopy={(name) => selectProject(name)}
          onOpenTask={(at) => setOpenTask(at)}
        />
        <RemoveJobDialog
          removing={removing}
          running={removingRunning}
          onCancel={() => setRemoving(null)}
          onConfirm={(deleteCopies) => void removeJob(deleteCopies)}
        />
        <JobEditorModal
          open={editing !== null}
          projects={projects.map((p) => p.name)}
          actionsFor={actionsFor}
          knownIds={knownIds}
          editing={
            editing?.mode === "edit"
              ? { project: editing.project, job: editing.job }
              : null
          }
          onClose={() => setEditing(null)}
          onSaved={() => void refetch()}
        />
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 pt-6">
        <h1 className="flex-1 text-lg font-semibold tracking-tight">
          Automations
        </h1>
        <button
          type="button"
          onClick={() => setEditing({ mode: "new" })}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-[13px] font-medium text-[var(--bg-primary)] shadow-sm transition hover:opacity-90"
        >
          <PlusIcon />
          New job
        </button>
      </div>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
        Every scheduled job across your projects, in one place.
      </p>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-6 pt-4">
        {error ? (
          <Empty title="Couldn't load scheduled jobs" body={error} />
        ) : rows === null ? (
          <p className="py-8 text-center text-[12px] text-[var(--text-muted)]">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <Empty
            icon
            title="Nothing scheduled yet"
            body="Create a job to run an AI prompt, a command, or an action on a schedule — for one project or all of them."
            action={
              <button
                type="button"
                onClick={() => setEditing({ mode: "new" })}
                className="mt-4 flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3.5 py-2 text-[13px] font-medium text-[var(--bg-primary)] shadow-sm transition hover:opacity-90"
              >
                <PlusIcon />
                New job
              </button>
            }
          />
        ) : (
          <div className="space-y-6">
            {[...groups.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([project, jobs]) => (
                <section key={project}>
                  <button
                    type="button"
                    onClick={() => selectProject(project)}
                    className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    {project}
                  </button>
                  <div className="mt-1 divide-y divide-[var(--border)]">
                    {jobs.map((job) => (
                      <JobRow
                        key={`${project}/${job.id}`}
                        job={job}
                        onRunNow={(id) => runNow(project, id)}
                        onStop={(id) => stopRun(project, id)}
                        onToggleEnabled={(id, enabled) =>
                          toggleEnabled(project, id, enabled)
                        }
                        onOpen={(j) => setOpen({ project, id: j.id })}
                        onEdit={(j) =>
                          setEditing({ mode: "edit", project, job: j })
                        }
                        onRemove={(j) => setRemoving({ project, job: j })}
                      />
                    ))}
                  </div>
                </section>
              ))}
          </div>
        )}
      </div>

      <JobEditorModal
        open={editing !== null}
        projects={projects.map((p) => p.name)}
        actionsFor={actionsFor}
        knownIds={knownIds}
        editing={
          editing?.mode === "edit"
            ? { project: editing.project, job: editing.job }
            : null
        }
        onClose={() => setEditing(null)}
        onSaved={() => void refetch()}
      />
      <RemoveJobDialog
        removing={removing}
        running={removingRunning}
        onCancel={() => setRemoving(null)}
        onConfirm={(deleteCopies) => void removeJob(deleteCopies)}
      />
    </div>
  );
}

function RemoveJobDialog({
  removing,
  running,
  onCancel,
  onConfirm,
}: {
  removing: { project: string; job: JobInfo } | null;
  // The job has a run alive (in any project, for a global job) — its copies
  // can't be removed out from under it.
  running: boolean;
  onCancel: () => void;
  onConfirm: (deleteCopies: boolean) => void;
}) {
  const [deleteCopies, setDeleteCopies] = useState(false);
  useEffect(() => setDeleteCopies(false), [removing]);
  return (
    <ConfirmDialog
      open={removing !== null}
      title="Remove job?"
      body={
        <>
          Remove{" "}
          <span className="font-medium text-[var(--text-primary)]">
            {removing?.job.label || removing?.job.id}
          </span>{" "}
          {removing?.job.source === "global"
            ? "from every project"
            : `from ${removing?.project}, along with its run history`}
          . This cannot be undone.
          {removing?.job.duplicate && (
            <label
              title={
                running ? "A run is in progress — stop it first" : undefined
              }
              className={`mt-3 flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)] ${
                running
                  ? "opacity-50"
                  : "cursor-pointer transition-colors hover:text-[var(--text-primary)]"
              }`}
            >
              <input
                type="checkbox"
                checked={deleteCopies && !running}
                disabled={running}
                onChange={(e) => setDeleteCopies(e.target.checked)}
                className="accent-[var(--accent-blue)] h-3 w-3"
              />
              Also remove the copies its runs created
            </label>
          )}
        </>
      }
      confirmLabel="Remove"
      variant="destructive"
      onCancel={onCancel}
      onConfirm={() => onConfirm(deleteCopies && !running)}
    />
  );
}

function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon?: boolean;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      {icon && (
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]">
          <ClockIcon />
        </span>
      )}
      <p className="text-[14px] font-medium text-[var(--text-primary)]">
        {title}
      </p>
      <p className="mt-1 max-w-sm text-[12px] leading-snug text-[var(--text-muted)]">
        {body}
      </p>
      {action}
    </div>
  );
}
