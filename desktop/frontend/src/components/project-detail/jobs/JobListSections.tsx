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

// The flat Automations feed, read like a messenger's chat list: everything
// unread first, then the rest. Each unread row carries its own dot, and the
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
  return (
    <div className="flex flex-col" style={{ zoom }}>
      {[...unreadRows, ...readRows].map((job, i) => (
        <JobRow
          key={rowKeyOf(job)}
          job={job}
          scopeLabel={scopeLabelFor(job)}
          divider={i > 0}
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
}
