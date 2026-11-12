import { useEffect, useState } from "react";
import { registerFileDropHandler } from "../fileDrop";
import { watchFileDrag } from "../fileDragWatch";
import { useAppStore } from "../store/app";
import { composerDragActive } from "./useComposerDragMove";
import { addDroppedFolders } from "./useSidebarFolderDrop";

// While there are no projects yet, a folder dropped anywhere in the window
// becomes one the way the sidebar's drop does, and the first one added opens.
// Says whether something is being dragged over the window.
export function useFirstRunFolderDrop(): boolean {
  const [over, setOver] = useState(false);

  useEffect(
    () =>
      watchFileDrag(
        () => setOver(true),
        () => setOver(false),
      ),
    [],
  );

  useEffect(
    () =>
      registerFileDropHandler("first-run-projects", (_x, _y, paths) => {
        setOver(false);
        if (paths.length === 0 || composerDragActive()) return false;
        const open = (name: string) => useAppStore.getState().selectProject(name);
        void addDroppedFolders(paths, open).then((added) => {
          if (added[0]) open(added[0].name);
        });
        return true;
      }),
    [],
  );

  return over;
}
