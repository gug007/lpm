import { useEffect, useState } from "react";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { displayNameForProjectName } from "../../ProjectNameDisplay";
import { jobScopePhrase, type JobInfo } from "../../../jobsFormat";
import type { ProjectInfo } from "../../../types";

interface RemoveJobDialogProps {
  removing: { project: string; job: JobInfo } | null;
  projects: ProjectInfo[];
  // The job has a run alive (in any project, for a global job) — its copies
  // can't be removed out from under it.
  running: boolean;
  onCancel: () => void;
  onConfirm: (deleteCopies: boolean) => void;
}

export function RemoveJobDialog({
  removing,
  projects,
  running,
  onCancel,
  onConfirm,
}: RemoveJobDialogProps) {
  const [deleteCopies, setDeleteCopies] = useState(false);
  useEffect(() => setDeleteCopies(false), [removing]);
  const removeScope = removing
    ? jobScopePhrase(removing.job, (name) =>
        displayNameForProjectName(name, projects),
      )
    : "";
  return (
    <ConfirmDialog
      open={removing !== null}
      title="Remove job?"
      body={
        <>
          Remove{" "}
          <span className="font-medium text-[var(--text-primary)]">
            {removing?.job.label || removing?.job.id}
          </span>
          {removeScope ? ` ${removeScope}` : ""}, along with its run history.
          This cannot be undone.
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
