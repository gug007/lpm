import { toast } from "../notifications/toast";
import { useAppStore } from "./app";
import { useProjectArchiveStore } from "./projectArchive";

/** Says a folder being added is an archived project and offers to bring it
 *  back, since an archived project has no sidebar row to select. */
export function noteArchivedAdoption(name: string): boolean {
  const archive = useProjectArchiveStore.getState();
  const found = Object.values(archive.byMachine)
    .flat()
    .find((p) => p.name === name);
  if (!found) return false;
  const bringBack = async () => {
    await archive.unarchive([{ name, label: found.label }]);
    const app = useAppStore.getState();
    if (app.projects.some((p) => p.name === name)) app.selectProject(name);
  };
  toast.info(`${found.label} is archived`, {
    description: "That folder is already a project. Unarchive it to put it back in the sidebar.",
    action: { label: "Unarchive", onClick: () => void bringBack() },
  });
  return true;
}
