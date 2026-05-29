import { useEffect } from "react";
import {
  StartWatchingProject,
  StopWatchingProject,
} from "../../bridge/commands";

// Drives the backend's file watcher to the given root. The backend
// watcher is a singleton, so when both windows want to watch different
// roots the most recent caller wins and the other window's git status
// goes stale until its own selection changes again — acceptable for
// now since the multi-window case is rare.
export function useProjectWatcher(root: string | null | undefined): void {
  useEffect(() => {
    if (!root) {
      StopWatchingProject().catch(() => {});
      return;
    }
    StartWatchingProject(root).catch(() => {});
    return () => {
      StopWatchingProject().catch(() => {});
    };
  }, [root]);
}
