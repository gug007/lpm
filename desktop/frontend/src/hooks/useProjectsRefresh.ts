import { useCallback, useEffect, useState } from "react";
import type { ProjectInfo } from "../types";
import { ListProjects } from "../../wailsjs/go/main/App";
import { EventsOn } from "../../wailsjs/runtime/runtime";

const POLL_INTERVAL_MS = 10_000;

/**
 * Loads the project list and keeps it fresh:
 *   - initial fetch on mount
 *   - polls every 10s while the tab is visible
 *   - pauses the interval when the tab is hidden, re-fetches on return
 *   - re-fetches when the backend emits "projects-changed"
 *   - exposes a `refresh` callback so callers can force a re-fetch
 *
 * Returns the current list, a setter (for optimistic updates), and
 * `refresh`. The returned `refresh` reference is stable.
 */
export function useProjectsRefresh() {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);

  const refresh = useCallback(async () => {
    try {
      const list = await ListProjects();
      setProjects((prev) => {
        const next = list || [];
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
    } catch (err) {
      console.error("Failed to load projects:", err);
    }
  }, []);

  useEffect(() => {
    refresh();
    let interval: ReturnType<typeof setInterval> | null = setInterval(refresh, POLL_INTERVAL_MS);

    const cancelEvent = EventsOn("projects-changed", refresh);
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
      if (typeof cancelEvent === "function") cancelEvent();
      if (typeof cancelStatus === "function") cancelStatus();
    };
  }, [refresh]);

  return { projects, setProjects, refresh };
}
