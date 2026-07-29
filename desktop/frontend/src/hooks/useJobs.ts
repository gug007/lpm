import { useCallback, useEffect, useRef, useState } from "react";
import { EventsOn } from "../../bridge/runtime";
import { ListAllJobs, ListJobs, RunJobNow, SetJobEnabled } from "../../bridge/commands";
import type { JobInfo } from "../jobsFormat";

// A job listed across projects; `project` is absent for a standalone job.
export type ScheduledJob = JobInfo & { project?: string };

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

export interface UseAllJobsResult {
  // null until the first load settles.
  jobs: ScheduledJob[] | null;
  error: string | null;
  refetch: () => Promise<void>;
}

// A scheduler tick resolves several jobs at once and each job-status event would
// otherwise cost a full walk of every project's config.
const ALL_JOBS_DEBOUNCE_MS = 250;

// Every project's scheduled jobs, kept live off job-status.
export function useAllJobs(): UseAllJobsResult {
  const [jobs, setJobs] = useState<ScheduledJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const inFlight = useRef(false);
  const queued = useRef(false);

  const refetch = useCallback(async () => {
    if (inFlight.current) {
      // Fold an event that lands mid-scan into one follow-up pass.
      queued.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        queued.current = false;
        const id = ++reqId.current;
        try {
          const rows = (await ListAllJobs()) as ScheduledJob[];
          if (id !== reqId.current) return;
          setJobs(Array.isArray(rows) ? rows : []);
          setError(null);
        } catch (err) {
          if (id !== reqId.current) return;
          setError(err instanceof Error ? err.message : String(err));
          setJobs((prev) => prev ?? []);
        }
      } while (queued.current);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refetch();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cancel = EventsOn("job-status", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void refetch();
      }, ALL_JOBS_DEBOUNCE_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      if (typeof cancel === "function") cancel();
    };
  }, [refetch]);

  return { jobs, error, refetch };
}
