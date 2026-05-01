import { useEffect } from "react";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { useAppStore } from "../store/app";

const POLL_INTERVAL_MS = 10_000;

export function useProjectsSync(): void {
  useEffect(() => {
    const refresh = useAppStore.getState().refreshProjects;
    refresh();

    let interval: ReturnType<typeof setInterval> | null = setInterval(
      refresh,
      POLL_INTERVAL_MS,
    );

    const cancelChanged = EventsOn("projects-changed", refresh);
    const cancelStatus = EventsOn("status-changed", refresh);

    const onVisibility = () => {
      if (document.hidden) {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      } else {
        refresh();
        if (!interval) interval = setInterval(refresh, POLL_INTERVAL_MS);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      if (typeof cancelChanged === "function") cancelChanged();
      if (typeof cancelStatus === "function") cancelStatus();
    };
  }, []);
}
