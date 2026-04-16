import { useEffect } from "react";
import { StartWatchingProject, StopWatchingProject } from "../../wailsjs/go/main/App";

// Subscribes to Go-side FS-events for a single project root. The watcher is
// ref-counted server-side, so multiple windows watching different projects —
// or the same project — coexist without clobbering each other.
export function useProjectWatcher(path: string | null | undefined): void {
  useEffect(() => {
    if (!path) return;
    StartWatchingProject(path).catch(() => {});
    return () => {
      StopWatchingProject(path).catch(() => {});
    };
  }, [path]);
}
