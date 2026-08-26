import { useEffect, useState } from "react";
import { EventsOn } from "../../bridge/runtime";
import { ListAllJobs } from "../../bridge/commands";

export interface JobsAmbient {
  running: number;
  unread: number;
}

/** Ambient scheduled-job state for the sidebar footer: how many jobs are
 *  running, and how many have results the user hasn't read. A headless run is
 *  otherwise invisible outside a transient toast. */
export function useJobsAmbient(): JobsAmbient {
  const [running, setRunning] = useState(0);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      ListAllJobs()
        .then((rows) => {
          if (!alive) return;
          const list = Array.isArray(rows)
            ? (rows as { running?: boolean; unread?: number }[])
            : [];
          setRunning(list.filter((r) => r.running === true).length);
          setUnread(list.filter((r) => (r.unread ?? 0) > 0).length);
        })
        .catch(() => {});
    };
    refresh();
    const cancelStatus = EventsOn("job-status", refresh);
    const cancelSeen = EventsOn("job-seen", refresh);
    return () => {
      alive = false;
      if (typeof cancelStatus === "function") cancelStatus();
      if (typeof cancelSeen === "function") cancelSeen();
    };
  }, []);
  return { running, unread };
}
