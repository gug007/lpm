import { useEffect } from "react";
import { EventsOn } from "../../bridge/runtime";
import { useGlobalAgentStatus } from "../store/globalAgentStatus";
import { GLOBAL_TERMINALS_KEY } from "../terminals";
import { usePaneStatus, type PaneStatus } from "./usePaneStatus";

// Agent hooks fire status-changed on every prompt, tool call and completion.
const DEBOUNCE_MS = 250;

/** Keeps the global Terminals' agent statuses current for the whole window:
 *  fetched once up front, again on each of the reserved project's status events,
 *  and when the window comes back into view after events may have been missed.
 *  Mounted once, in the main window, so the sidebar reads them whether or not
 *  the Terminals view has ever been opened. */
export function useGlobalAgentStatusSync(): void {
  useEffect(() => {
    const { refresh } = useGlobalAgentStatus.getState();
    void refresh();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const cancelStatus = EventsOn("status-changed", (project: string) => {
      if (project !== GLOBAL_TERMINALS_KEY) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void refresh();
      }, DEBOUNCE_MS);
    });
    const onVisibility = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearTimeout(timer);
      cancelStatus();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}

/** The global Terminals' statuses folded per tab, for painting the tab strip. */
export function useGlobalTerminalStatus(): PaneStatus {
  return usePaneStatus(useGlobalAgentStatus((s) => s.entries));
}
