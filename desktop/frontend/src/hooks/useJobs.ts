import { useCallback, useEffect, useRef, useState } from "react";
import { EventsOn } from "../../bridge/runtime";
import { ListJobs, RunJobNow, SetJobEnabled } from "../../bridge/commands";
import type { JobInfo } from "../jobsFormat";

interface JobStatusEvent {
  project: string;
  jobId: string;
  result: string;
  copy?: string;
}

export interface UseJobsResult {
  jobs: JobInfo[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  runNow: (id: string) => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
}

// Loads a project's scheduled jobs and keeps them live: any job-status event for
// this project (a run finishing, a block clearing) triggers a refetch so the
// row's last/next-run and state reflect the backend without a manual reload.
export function useJobs(projectName: string, active: boolean): UseJobsResult {
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const refetch = useCallback(async () => {
    const id = ++reqId.current;
    try {
      const result = (await ListJobs(projectName)) as JobInfo[];
      if (id !== reqId.current) return;
      setJobs(Array.isArray(result) ? result : []);
      setError(null);
    } catch (err) {
      if (id !== reqId.current) return;
      setError(err instanceof Error ? err.message : "Couldn't load scheduled jobs.");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [projectName]);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    void refetch();
    const cancel = EventsOn("job-status", (payload: JobStatusEvent) => {
      if (payload?.project === projectName) void refetch();
    });
    return () => {
      if (typeof cancel === "function") cancel();
    };
  }, [active, projectName, refetch]);

  const runNow = useCallback(
    async (id: string) => {
      await RunJobNow(projectName, id);
      void refetch();
    },
    [projectName, refetch],
  );

  const setEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      setJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, enabled } : j)),
      );
      try {
        await SetJobEnabled(projectName, id, enabled);
      } finally {
        void refetch();
      }
    },
    [projectName, refetch],
  );

  return { jobs, loading, error, refetch, runNow, setEnabled };
}
