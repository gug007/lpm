import { useEffect } from "react";
import { EventsOn } from "../../bridge/runtime";
import { useAppStore } from "../store/app";

const POLL_INTERVAL_MS = 10_000;

interface ProjectsSyncOptions {
  // Detached windows skip templates (only the main settings UI shows
  // them) and the 10s poll fallback (the main window already polls and
  // broadcasts via projects-changed, so a per-window poll multiplies
  // ListProjects load by the number of detached windows).
  mode?: "main" | "detached";
}

export function useProjectsSync(options: ProjectsSyncOptions = {}): void {
  const isMain = (options.mode ?? "main") === "main";
  useEffect(() => {
    const {
      refreshProjects,
      refreshTemplates,
      refreshDetached,
      rehydrateSidebarLayout,
    } = useAppStore.getState();
    refreshProjects();
    refreshDetached();
    if (isMain) refreshTemplates();

    let interval: ReturnType<typeof setInterval> | null = isMain
      ? setInterval(refreshProjects, POLL_INTERVAL_MS)
      : null;

    const cancelChanged = EventsOn("projects-changed", refreshProjects);
    const cancelStatus = EventsOn("status-changed", refreshProjects);
    const cancelDetached = EventsOn("detached-changed", refreshDetached);
    const cancelSidebar = EventsOn("sidebar-changed", rehydrateSidebarLayout);
    const cancelTemplates = isMain
      ? EventsOn("templates-changed", refreshTemplates)
      : null;

    const onVisibility = () => {
      if (document.hidden) {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      } else {
        refreshProjects();
        if (isMain && !interval) {
          interval = setInterval(refreshProjects, POLL_INTERVAL_MS);
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      if (typeof cancelChanged === "function") cancelChanged();
      if (typeof cancelStatus === "function") cancelStatus();
      if (typeof cancelDetached === "function") cancelDetached();
      if (typeof cancelSidebar === "function") cancelSidebar();
      if (typeof cancelTemplates === "function") cancelTemplates();
    };
  }, [isMain]);
}
