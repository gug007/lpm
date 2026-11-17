import { useState } from "react";
import type { JobInfo } from "../../../jobsFormat";
import { jobNeedsAnswer, lastRunFailed } from "./jobRowPreview";

export type JobListFilter = "all" | "needs" | "failed";

const MATCHES: Record<Exclude<JobListFilter, "all">, (job: JobInfo) => boolean> = {
  needs: jobNeedsAnswer,
  failed: lastRunFailed,
};

/** The list's filter: every automation, the ones waiting for an answer, or the
 *  ones whose last run failed. A filter with nothing left in it lets go. */
export function useJobListFilter<T extends JobInfo>(rows: T[]) {
  const [picked, setPicked] = useState<JobListFilter>("all");
  const counts: Record<JobListFilter, number> = {
    all: rows.length,
    needs: rows.filter(MATCHES.needs).length,
    failed: rows.filter(MATCHES.failed).length,
  };
  const active: JobListFilter = picked !== "all" && counts[picked] > 0 ? picked : "all";
  return {
    counts,
    active,
    pick: setPicked,
    rows: active === "all" ? rows : rows.filter(MATCHES[active]),
  };
}
