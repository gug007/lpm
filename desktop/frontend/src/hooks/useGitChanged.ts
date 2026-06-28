import { useEffect } from "react";
import { EventsOn } from "../../bridge/runtime";
import { GIT_CHANGED_EVENT } from "../types";

// Run `onChanged` whenever the project's git state changes (the file watcher
// emits the project path). Shared by the review pane and its file-list hook.
export function useGitChanged(projectPath: string, onChanged: () => void) {
  useEffect(() => {
    const cancel = EventsOn(GIT_CHANGED_EVENT, (path: string) => {
      if (path === projectPath) onChanged();
    });
    return () => {
      if (typeof cancel === "function") cancel();
    };
  }, [projectPath, onChanged]);
}
