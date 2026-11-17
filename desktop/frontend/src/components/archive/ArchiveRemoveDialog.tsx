import { trashName } from "../../platform";
import { copiesWord, type ArchivedProject } from "../../projectArchive";
import { useAppStore } from "../../store/app";
import { useProjectArchiveStore } from "../../store/projectArchive";
import { ConfirmDialog } from "../ui/ConfirmDialog";

// "lpm" forgets the project and keeps its folder; "disk" also moves the folder
// to the Trash.
export type ArchiveRemoval = { project: ArchivedProject; from: "lpm" | "disk" };

/** Removes an archived project, saying what goes with it the way the sidebar's
 *  Remove from lpm and Remove from disk do. */
export function ArchiveRemoveDialog({
  removal,
  onClose,
}: {
  removal: ArchiveRemoval | null;
  onClose: () => void;
}) {
  const removeProject = useAppStore((s) => s.removeProject);
  const removeProjectCascade = useAppStore((s) => s.removeProjectCascade);
  const removeProjectFromDisk = useAppStore((s) => s.removeProjectFromDisk);
  const load = useProjectArchiveStore((s) => s.load);
  if (!removal) return null;

  const { name, label, copies } = removal.project;
  const disk = removal.from === "disk";
  const remove = async () => {
    onClose();
    if (disk) await removeProjectFromDisk(name);
    else await (copies > 0 ? removeProjectCascade(name) : removeProject(name));
    await load();
  };
  const copiesGo =
    copies === 1
      ? "Its duplicate or worktree is deleted from disk, folder included."
      : `Its ${copiesWord(copies)} are deleted from disk, folders included.`;

  return (
    <ConfirmDialog
      open
      variant="destructive"
      title={disk ? "Remove from disk" : "Remove project"}
      confirmLabel={disk || copies > 0 ? "Delete" : "Remove"}
      confirmText={label}
      onCancel={onClose}
      onConfirm={() => void remove()}
      body={
        <div className="flex flex-col gap-2">
          <p>
            Remove <span className="font-medium text-[var(--text-primary)]">{label}</span> from
            lpm{disk ? ` and move its folder to the ${trashName()}` : ""}? This deletes its
            services, actions, terminals and automations.
            {!disk && " Its notes, memory and folder on disk stay."}
          </p>
          {copies > 0 && <p>{copiesGo} This can't be undone.</p>}
          {disk && <p>You can restore the folder from the {trashName()}.</p>}
        </div>
      }
    />
  );
}
