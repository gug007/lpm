import { useEffect, useState } from "react";
import { EventsOn } from "../../bridge/runtime";
import { GetProject } from "../../bridge/commands";
import { GLOBAL_TERMINALS_KEY } from "../terminals";
import type { ProjectInfo, StatusEntry } from "../types";
import { usePaneStatus, type PaneStatus } from "./usePaneStatus";

// Agent hooks fire status-changed on every prompt, tool call and completion.
const DEBOUNCE_MS = 250;

/** Status rows for agents running in the global Terminals tabs. The backend
 *  files them under the reserved project key, which is not in the project list
 *  the sidebar syncs, so nothing else ever fetches them. */
export function useGlobalTerminalStatus(visible: boolean): PaneStatus {
  const [entries, setEntries] = useState<StatusEntry[]>([]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const load = () => {
      GetProject(GLOBAL_TERMINALS_KEY)
        .then((info: ProjectInfo | null) => {
          if (!cancelled) setEntries(info?.statusEntries ?? []);
        })
        .catch(() => {});
    };
    load();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const cancelStatus = EventsOn("status-changed", (project: string) => {
      if (project !== GLOBAL_TERMINALS_KEY) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        load();
      }, DEBOUNCE_MS);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      cancelStatus();
    };
  }, [visible]);

  return usePaneStatus(entries);
}
