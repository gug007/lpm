import { trashName } from "../../platform";
import {
  plural,
  rebuildableBytes,
  rebuildableKinds,
  type ArchivedProject,
  type ProjectSize,
} from "../../projectArchive";
import { formatBytes } from "../../syncApi";
import { ConfirmDialog } from "../ui/ConfirmDialog";

// More kinds than this are named as "and N more", so the sentence stays short.
const KINDS_NAMED = 4;

function listed(names: string[]): string {
  const shown = names.slice(0, KINDS_NAMED);
  if (names.length > KINDS_NAMED) shown.push(`${names.length - KINDS_NAMED} more`);
  return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : (shown[0] ?? "");
}

/** Asks before the folders a reinstall recreates go to the Trash. */
export function ArchiveFreeDialog({
  projects,
  sizes,
  onCancel,
  onConfirm,
}: {
  projects: ArchivedProject[] | null;
  sizes: ReadonlyMap<string, ProjectSize | null>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!projects || projects.length === 0) return null;
  const measured = projects.map((p) => sizes.get(p.name));
  const total = measured.reduce((n, s) => n + rebuildableBytes(s), 0);
  const kinds = rebuildableKinds(measured).map((k) => k.path);
  const [only] = projects;
  const where =
    projects.length === 1 && only ? only.label : `${plural(projects.length, "archived project")}`;

  return (
    <ConfirmDialog
      open
      title={`Free ${formatBytes(total)}?`}
      confirmLabel={`Move to ${trashName()}`}
      onCancel={onCancel}
      onConfirm={onConfirm}
      body={
        <div className="flex flex-col gap-2">
          <p>
            Moves {listed(kinds)} to the {trashName()} in{" "}
            <span className="font-medium text-[var(--text-primary)]">{where}</span>.
          </p>
          <p>
            Code, git history and setup stay. After Unarchive, install or build again to bring
            them back.
          </p>
        </div>
      }
    />
  );
}
