// Ordering and labelling for the flat Automations list. Pure so the "unread
// first" rule and the per-row project label can be tested without React.

import { jobTargets, type JobInfo } from "./jobsFormat";
import { isOpenAsk } from "./jobAsk";
import { prefixName } from "./peer/markers";

type ListJob = JobInfo & { project?: string };

// The sentinel folder a standalone job runs in: "" here, and the same marked
// for its machine when it lives on a paired one, so its commands go there.
function standaloneTarget(job: JobInfo): string {
  return job.host ? prefixName(job.host, "") : "";
}

// The folders a row's job runs in: a standalone job's is the sentinel;
// project/repo and single-target rows carry a one-entry `targets`; a shared
// job carries all of them.
export function targetsOfRow(job: JobInfo): string[] {
  return job.standalone ? [standaloneTarget(job)] : job.targets ?? [];
}

// A representative project for opening / editing / removing a row: standalone
// has none, otherwise the first target.
export function rowProject(job: ListJob): string {
  return job.standalone ? standaloneTarget(job) : job.targets?.[0] ?? job.project ?? "";
}

export function isUnread(job: ListJob): boolean {
  return (job.unread ?? 0) > 0;
}

// Newest activity first, with everything unread ahead of everything read — the
// list is a feed of what the jobs did, not a directory of what exists. A job
// waiting on the user's answer leads its part of the list.
export function sortJobsForList<T extends ListJob>(jobs: T[]): T[] {
  const waiting = (job: T) => isOpenAsk(job.ask);
  return [...jobs].sort((a, b) => {
    if (waiting(a) !== waiting(b)) return waiting(a) ? -1 : 1;
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

// A Manual automation only runs when asked to, so on/off says nothing about it:
// its switch stays only to turn one back on.
export function hasOnOffSwitch(job: JobInfo): boolean {
  return !(job.schedule?.mode === "manual" && job.enabled);
}
