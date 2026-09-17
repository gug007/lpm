import { useEffect, useRef } from "react";
import { EventsOn } from "../../bridge/runtime";
import { GIT_CHANGED_EVENT } from "../types";

type GitChangedPayload = { path: string; files: string[] | null };

// Run `onChanged` whenever the project's git state changes. The watcher emits the
// project path plus the repo-relative files that moved (null = "unknown", refetch
// everything); consumers that only track a subset filter on `changedFiles`.
// While `active` is false (a hidden tab) events are held back, and the next
// showing replays them as one unknown change.
export function useGitChanged(
  projectPath: string,
  onChanged: (changedFiles: string[] | null) => void,
  active = true,
) {
  const activeRef = useRef(active);
  activeRef.current = active;
  const missedRef = useRef(false);

  useEffect(() => {
    const deliver = (files: string[] | null) => {
      if (!activeRef.current) {
        missedRef.current = true;
        return;
      }
      onChanged(files);
    };
    const cancel = EventsOn(GIT_CHANGED_EVENT, (payload: GitChangedPayload | string) => {
      // Tolerate the legacy bare-string payload: treat it as "unknown".
      if (typeof payload === "string") {
        if (payload === projectPath) deliver(null);
        return;
      }
      if (payload?.path === projectPath) deliver(payload.files ?? null);
    });
    return () => {
      if (typeof cancel === "function") cancel();
    };
  }, [projectPath, onChanged]);

  useEffect(() => {
    if (!active || !missedRef.current) return;
    missedRef.current = false;
    onChanged(null);
  }, [active, onChanged]);
}
