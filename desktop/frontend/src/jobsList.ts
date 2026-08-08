// Ordering and labelling for the flat Automations list. Pure so the "unread
// first" rule and the per-row project label can be tested without React.

import { jobTargets, type JobInfo } from "./jobsFormat";

type ListJob = JobInfo & { project?: string };

export function isUnread(job: ListJob): boolean {
  return (job.unread ?? 0) > 0;
}

// Newest activity first, with everything unread ahead of everything read — the
// list is a feed of what the jobs did, not a directory of what exists.
export function sortJobsForList<T extends ListJob>(jobs: T[]): T[] {
  return [...jobs].sort((a, b) => {
    if (isUnread(a) !== isUnread(b)) return isUnread(a) ? -1 : 1;
    if (a.running !== b.running) return a.running ? -1 : 1;
    const last = (b.lastRunAt ?? 0) - (a.lastRunAt ?? 0);
    if (last !== 0) return last;
    return (a.label || a.id).localeCompare(b.label || b.id);
  });
}

// Which projects the job runs in, said in a few words: the project's own name
// when there's one, a count when there are several, and "All projects" when
// that count is every project there is.
export function jobScopeLabel(
  job: ListJob,
  projectCount: number,
  displayName: (name: string) => string,
): string {
  const targets = jobTargets(job);
  if (targets.length === 0) return "No project";
  if (targets.length === 1) return displayName(targets[0]);
  if (targets.length >= projectCount) return "All projects";
  return `${targets.length} projects`;
}
