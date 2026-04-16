import { useEffect } from "react";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { useAppStore } from "../store/app";
import { DETACHED_EVENT } from "../events";

const POLL_INTERVAL_MS = 10_000;

/**
 * Keeps the store's project list in sync with the backend:
 *   - initial fetch on mount
 *   - polls every 10s while the tab is visible (only when polling is enabled)
 *   - pauses the interval when the tab is hidden, re-fetches on return
 *   - re-fetches when the backend emits "projects-changed" or "status-changed"
 *
 * Pass `{ poll: false }` in detached project windows — the backend broadcasts
 * events to every webview, so the poll is redundant and would N-multiply the
 * ListProjects load per open window.
 */
export function useProjectsSync(options: { poll?: boolean } = {}): void {
  const { poll = true } = options;
  useEffect(() => {
    const { refreshProjects, refreshDetached } = useAppStore.getState();
    refreshProjects();
    refreshDetached();

    let interval: ReturnType<typeof setInterval> | null = poll
      ? setInterval(refreshProjects, POLL_INTERVAL_MS)
      : null;

    const cancelChanged = EventsOn("projects-changed", refreshProjects);
    const cancelStatus = EventsOn("status-changed", refreshProjects);
    const cancelDetached = EventsOn(DETACHED_EVENT, refreshDetached);

    const onVisibility = () => {
      if (document.hidden) {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      } else {
        refreshProjects();
        refreshDetached();
        if (poll && !interval) interval = setInterval(refreshProjects, POLL_INTERVAL_MS);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      if (typeof cancelChanged === "function") cancelChanged();
      if (typeof cancelStatus === "function") cancelStatus();
      if (typeof cancelDetached === "function") cancelDetached();
    };
  }, [poll]);
}
