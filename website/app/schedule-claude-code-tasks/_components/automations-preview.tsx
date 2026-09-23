import { Plus } from "lucide-react";
import { EARLIER_JOBS, UNREAD_JOBS } from "./replica-jobs";
import { ReplicaJobRow } from "./replica-job-row";
import { ReplicaSidebar } from "./replica-sidebar";
import { ReplicaWindow } from "./replica-window";

const GROUP_LABEL = "px-1 text-[10px] font-semibold uppercase tracking-[0.08em]";

export default function AutomationsPreview() {
  return (
    <section id="automations" className="scroll-mt-20 px-4 pb-16 sm:px-6 sm:pb-20">
      <figure className="mx-auto max-w-5xl">
        <ReplicaWindow title="lpm — Automations">
          <div className="flex">
            <ReplicaSidebar />
            <div className="min-w-0 flex-1 px-3 pb-4 sm:px-6 sm:pb-6">
              <div className="flex items-center gap-2 pt-5 sm:gap-3">
                <span className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-[#e5e5e5]">
                  Automations
                  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#60a5fa] px-1.5 text-[10px] font-semibold tabular-nums text-[#1a1a1a]">
                    2
                  </span>
                </span>
                <span className="flex-1" />
                <span className="hidden rounded-lg bg-[#242424] p-0.5 text-[12px] font-medium min-[420px]:flex">
                  <span className="rounded-md bg-[#3a3a3a] px-2.5 py-1 text-[#e5e5e5]">List</span>
                  <span className="px-2.5 py-1 text-[#919191]">Week</span>
                </span>
                <span className="hidden rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-[#b3b3b3] md:inline">
                  Mark all read
                </span>
                <span className="flex items-center gap-1.5 rounded-lg bg-[#e5e5e5] px-3 py-1.5 text-[13px] font-medium text-[#1a1a1a]">
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
                  New job
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[#919191]">
                2 jobs have new messages since you last looked.
              </p>
              <div className="mt-4 space-y-4">
                <div>
                  <span className={`${GROUP_LABEL} text-[#60a5fa]`}>New</span>
                  <div className="mt-1 space-y-0.5">
                    {UNREAD_JOBS.map((job) => (
                      <ReplicaJobRow key={job.label} job={job} />
                    ))}
                  </div>
                </div>
                <div>
                  <span className={`${GROUP_LABEL} text-[#919191]`}>Earlier</span>
                  <div className="mt-1 space-y-0.5">
                    {EARLIER_JOBS.map((job) => (
                      <ReplicaJobRow key={job.label} job={job} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ReplicaWindow>
        <figcaption className="mx-auto mt-4 max-w-2xl text-pretty text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          The Automations list in lpm: every job across your projects, with new
          results on top, what&apos;s running now, and when each job runs next.
        </figcaption>
      </figure>
    </section>
  );
}
