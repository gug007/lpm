import { useEffect } from "react";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { useAppStore } from "../store/app";

const POLL_INTERVAL_MS = 10_000;

export function useProjectsSync(): void {
  useEffect(() => {
    const { refreshProjects, refreshTemplates } = useAppStore.getState();
    refreshProjects();
    refreshTemplates();

    let interval: ReturnType<typeof setInterval> | null = setInterval(
      refreshProjects,
      POLL_INTERVAL_MS,
    );

    const cancelChanged = EventsOn("projects-changed", refreshProjects);
    const cancelStatus = EventsOn("status-changed", refreshProjects);
    const cancelTemplates = EventsOn("templates-changed", refreshTemplates);

    const onVisibility = () => {
      if (document.hidden) {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      } else {
        refreshProjects();
        if (!interval) interval = setInterval(refreshProjects, POLL_INTERVAL_MS);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      if (typeof cancelChanged === "function") cancelChanged();
      if (typeof cancelStatus === "function") cancelStatus();
      if (typeof cancelTemplates === "function") cancelTemplates();
    };
  }, []);
}
