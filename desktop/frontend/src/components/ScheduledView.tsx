import { useCallback, useEffect, useState } from "react";
import { EventsOn } from "../../bridge/runtime";
import { ListAllJobs, RunJobNow, SetJobEnabled } from "../../bridge/commands";
import { useAppStore } from "../store/app";
import { ClockIcon, PlusIcon } from "./icons";
import type { JobInfo } from "../jobsFormat";
import { JobRow } from "./project-detail/jobs/JobRow";
import { JobMessages } from "./project-detail/jobs/JobMessages";
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
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(async () => {
    try {
      const result = (await ListAllJobs()) as ScheduledJob[];
      setRows(Array.isArray(result) ? result : []);
      setError(null);
      setRefreshKey((n) => n + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't load scheduled jobs.",
      );
      setRows((prev) => prev ?? []);
    }
  }, []);

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

  const openJob = open
    ? (rows ?? []).find((r) => r.project === open.project && r.id === open.id)
    : undefined;
  useEffect(() => {
    if (open && rows !== null && !openJob) setOpen(null);
  }, [open, rows, openJob]);

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
          onRunNow={() => void RunJobNow(open.project, openJob.id)}
          onToggleEnabled={(enabled) => {
            void SetJobEnabled(open.project, openJob.id, enabled).finally(
              () => void refetch(),
            );
          }}
          onOpenCopy={(name) => selectProject(name)}
        />
        <JobEditorModal
          open={editing !== null}
          projects={projects.map((p) => p.name)}
          actionsFor={actionsFor}
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
          Scheduled
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
                        onRunNow={(id) => void RunJobNow(project, id)}
                        onToggleEnabled={(id, enabled) => {
                          void SetJobEnabled(project, id, enabled).finally(
                            () => void refetch(),
                          );
                        }}
                        onOpen={(j) => setOpen({ project, id: j.id })}
                        onEdit={(j) =>
                          setEditing({ mode: "edit", project, job: j })
                        }
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
        editing={
          editing?.mode === "edit"
            ? { project: editing.project, job: editing.job }
            : null
        }
        onClose={() => setEditing(null)}
        onSaved={() => void refetch()}
      />
    </div>
  );
}

function Empty({
  icon,
  title,
  body,
}: {
  icon?: boolean;
  title: string;
  body: string;
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
    </div>
  );
}
