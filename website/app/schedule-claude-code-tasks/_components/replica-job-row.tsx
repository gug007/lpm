import { Square } from "lucide-react";
import { TONE_DOT, type ReplicaJob } from "./replica-jobs";
import { ReplicaSwitch } from "./replica-switch";

export function ReplicaJobRow({ job }: { job: ReplicaJob }) {
  const unread = job.unread ?? 0;
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg py-3 pl-2 pr-1.5 ${
        unread > 0 ? "bg-[#60a5fa]/[0.08]" : ""
      } ${job.paused ? "opacity-60" : ""}`}
    >
      <span className="flex w-1.5 shrink-0 justify-center pt-[7px]">
        {unread > 0 && <span className="h-1.5 w-1.5 rounded-full bg-[#60a5fa]" />}
      </span>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#2a2a2a] text-[15px]">
        {job.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-2">
          <span
            className={`min-w-0 shrink truncate text-[13px] text-[#e5e5e5] ${
              unread > 0 ? "font-semibold" : "font-medium"
            }`}
          >
            {job.label}
          </span>
          <span className="inline-flex max-w-[9rem] shrink-0 items-center rounded-full border border-[#2e2e2e] px-2 py-px text-[10px] font-medium text-[#919191]">
            <span className="truncate">{job.scope}</span>
          </span>
        </span>
        <span
          className={`mt-1 line-clamp-2 break-words leading-snug text-[#b3b3b3] [overflow-wrap:anywhere] ${
            job.mono ? "font-mono text-[11.5px]" : "text-[12px]"
          }`}
        >
          {job.description}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-[#919191]">
          {job.running ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#22d3ee] motion-safe:animate-pulse" />
          ) : (
            job.tone && (
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[job.tone]}`} />
            )
          )}
          <span className="min-w-0 truncate">
            {unread > 0 && (
              <span className="font-medium text-[#60a5fa]">
                {unread} new {unread === 1 ? "message" : "messages"} ·{" "}
              </span>
            )}
            {job.running ? <span className="text-[#22d3ee]">{job.running}</span> : job.status}
          </span>
        </span>
      </span>
      {job.running && (
        <span className="shrink-0 rounded-md p-2 text-[#919191]">
          <Square className="h-3 w-3" strokeWidth={2} fill="currentColor" />
        </span>
      )}
      <ReplicaSwitch on={!job.paused} className="mt-1.5" />
    </div>
  );
}
