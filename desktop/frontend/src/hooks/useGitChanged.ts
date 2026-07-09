import { useEffect } from "react";
import { EventsOn } from "../../bridge/runtime";
import { GIT_CHANGED_EVENT } from "../types";

type GitChangedPayload = { path: string; files: string[] | null };

// Run `onChanged` whenever the project's git state changes. The watcher emits the
// project path plus the repo-relative files that moved (null = "unknown", refetch
// everything); consumers that only track a subset filter on `changedFiles`.
export function useGitChanged(
  projectPath: string,
  onChanged: (changedFiles: string[] | null) => void,
) {
  useEffect(() => {
    const cancel = EventsOn(GIT_CHANGED_EVENT, (payload: GitChangedPayload | string) => {
      // Tolerate the legacy bare-string payload: treat it as "unknown".
      if (typeof payload === "string") {
        if (payload === projectPath) onChanged(null);
        return;
      }
      if (payload?.path === projectPath) onChanged(payload.files ?? null);
    });
    return () => {
      if (typeof cancel === "function") cancel();
    };
  }, [projectPath, onChanged]);
}
