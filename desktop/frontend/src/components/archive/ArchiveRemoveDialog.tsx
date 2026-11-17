import { copiesWord, type ArchivedProject } from "../../projectArchive";
import { useAppStore } from "../../store/app";
import { useProjectArchiveStore } from "../../store/projectArchive";
import { ConfirmDialog } from "../ui/ConfirmDialog";

/** Removes an archived project from lpm, saying what goes with it the way the
 *  sidebar's Remove does. */
export function ArchiveRemoveDialog({
  project,
  onClose,
}: {
  project: ArchivedProject | null;
  onClose: () => void;
}) {
  const removeProject = useAppStore((s) => s.removeProject);
  const removeProjectCascade = useAppStore((s) => s.removeProjectCascade);
  const load = useProjectArchiveStore((s) => s.load);
  if (!project) return null;

  const { name, label, copies } = project;
  const remove = async () => {
    onClose();
    await (copies > 0 ? removeProjectCascade(name) : removeProject(name));
    await load();
  };

  return (
    <ConfirmDialog
      open
      variant="destructive"
      title="Remove project"
      confirmLabel={copies > 0 ? "Delete" : "Remove"}
      confirmText={label}
      onCancel={onClose}
      onConfirm={() => void remove()}
      body={
        <div className="flex flex-col gap-2">
          <p>
            Remove <span className="font-medium text-[var(--text-primary)]">{label}</span> from
            lpm? This deletes its services, actions, terminals and automations. Its notes, memory
            and folder on disk stay.
          </p>
          {copies > 0 && (
            <p>
              {copies === 1
                ? "Its duplicate or worktree is deleted from disk, folder included."
                : `Its ${copiesWord(copies)} are deleted from disk, folders included.`}{" "}
              This can't be undone.
            </p>
          )}
        </div>
      }
    />
  );
}
