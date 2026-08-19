import type { ActionInfo, ProjectInfo } from "../../../types";
import type { JobInfo } from "../../../jobsFormat";
import type { ScheduledJob } from "../../../hooks/useJobs";
import { JobEditorModal } from "./JobEditorModal";
import { RemoveJobDialog } from "./RemoveJobDialog";
import { RunProjectsDialog } from "./RunProjectsDialog";

export type JobEditing =
  | { mode: "new" }
  | { mode: "edit"; project: string; job: JobInfo }
  | null;

interface JobDialogsProps {
  projects: ProjectInfo[];
  editing: JobEditing;
  onCloseEditor: () => void;
  onSaved: () => void;
  actionsFor: (project: string) => ActionInfo[];
  knownIds: (project: string | null) => string[];
  removing: { project: string; job: JobInfo } | null;
  removingRunning: boolean;
  onCancelRemove: () => void;
  onConfirmRemove: (deleteCopies: boolean) => void;
  runPick: ScheduledJob | null;
  onCancelRunPick: () => void;
  onRunPicked: (projects: string[]) => void;
}

// The three dialogs Automations can raise. They mount identically behind the
// list and behind a job's own page, so both branches render this rather than
// repeating the wiring.
export function JobDialogs({
  projects,
  editing,
  onCloseEditor,
  onSaved,
  actionsFor,
  knownIds,
  removing,
  removingRunning,
  onCancelRemove,
  onConfirmRemove,
  runPick,
  onCancelRunPick,
  onRunPicked,
}: JobDialogsProps) {
  return (
    <>
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
        onClose={onCloseEditor}
        onSaved={onSaved}
      />
      <RemoveJobDialog
        removing={removing}
        projects={projects}
        running={removingRunning}
        onCancel={onCancelRemove}
        onConfirm={onConfirmRemove}
      />
      <RunProjectsDialog
        open={runPick !== null}
        jobLabel={runPick?.label || runPick?.id || ""}
        targets={runPick?.targets ?? []}
        projects={projects}
        onCancel={onCancelRunPick}
        onRun={onRunPicked}
      />
    </>
  );
}
