import type { ScheduledJob } from "../../../hooks/useJobs";
import { JobRow } from "./JobRow";

interface JobListSectionsProps {
  unreadRows: ScheduledJob[];
  readRows: ScheduledJob[];
  // Reader zoom for the section, applied here so the header above it stays put.
  zoom: number;
  scopeLabelFor: (job: ScheduledJob) => string;
  rowKeyOf: (job: ScheduledJob) => string;
  onRunNow: (job: ScheduledJob) => void;
  onStop: (job: ScheduledJob) => void;
  onToggleEnabled: (job: ScheduledJob, enabled: boolean) => void;
  onOpen: (job: ScheduledJob) => void;
  onEdit: (job: ScheduledJob) => void;
  onRemove: (job: ScheduledJob) => void;
}

// The flat Automations feed: everything unread first, then the rest. The
// project each job runs in rides on the row, so the list never groups.
export function JobListSections({
  unreadRows,
  readRows,
  zoom,
  scopeLabelFor,
  rowKeyOf,
  onRunNow,
  onStop,
  onToggleEnabled,
  onOpen,
  onEdit,
  onRemove,
}: JobListSectionsProps) {
  const renderRows = (jobs: ScheduledJob[], sectionKey: string) => (
    <div className="space-y-0.5">
      {jobs.map((job) => (
        <JobRow
          key={`${sectionKey}/${rowKeyOf(job)}`}
          job={job}
          scopeLabel={scopeLabelFor(job)}
          onRunNow={() => onRunNow(job)}
          onStop={() => onStop(job)}
          onToggleEnabled={(_id, enabled) => onToggleEnabled(job, enabled)}
          onOpen={(j) => onOpen(j as ScheduledJob)}
          onEdit={(j) => onEdit(j as ScheduledJob)}
          onRemove={(j) => onRemove(j as ScheduledJob)}
        />
      ))}
    </div>
  );

  return (
    <div className="-mx-1 space-y-4" style={{ zoom }}>
      {unreadRows.length > 0 && (
        <section key="unread">
          <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-blue-text)]">
            New
          </span>
          <div className="mt-1">{renderRows(unreadRows, "unread")}</div>
        </section>
      )}
      {readRows.length > 0 && (
        <section key="read">
          {unreadRows.length > 0 && (
            <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Earlier
            </span>
          )}
          <div className={unreadRows.length > 0 ? "mt-1" : ""}>
            {renderRows(readRows, "read")}
          </div>
        </section>
      )}
    </div>
  );
}
