import { useAppStore } from "../store/app";
import { useCopySpaceStore } from "../store/copySpace";
import { HardDriveIcon } from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";

/** A project menu's way into the Free space panel, on a project with copies
 *  and on each of its copies. */
export function CopySpaceMenuItem({ projectName, onClose }: { projectName: string; onClose: () => void }) {
  const projects = useAppStore((s) => s.projects);
  const project = projects.find((p) => p.name === projectName);
  if (!project || project.isRemote) return null;
  const original = project.parentName || project.name;
  if (!projects.some((p) => p.parentName === original)) return null;
  return (
    <ContextMenuItem
      label="Free space…"
      icon={<HardDriveIcon />}
      onClick={() => {
        useCopySpaceStore.getState().open(original);
        onClose();
      }}
    />
  );
}
