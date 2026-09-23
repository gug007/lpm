import { ChevronDown, Clock, X } from "lucide-react";
import { ReplicaFormRow } from "./replica-form-row";

const GROUP = "mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#919191]";
const CARD = "divide-y divide-[#2e2e2e]/70 overflow-hidden rounded-xl bg-[#242424]/40";
const NOTE = "mt-2 px-1 text-[12px] leading-snug text-[#919191]";

const DETAILS = [
  { label: "Runs in", value: "saas-app" },
  { label: "Works on", value: "A fresh copy of it" },
  { label: "Does", value: "AI prompt" },
  { label: "Model", value: "Claude Code · Opus" },
  { label: "Effort", value: "High" },
  { label: "Access", value: "Full access" },
];

const FREQUENCY = [
  { label: "Repeat", value: "Every day" },
  { label: "Use", value: "All of them" },
  { label: "Time", value: "A set time" },
  { label: "At", value: "02:00" },
];

export function JobEditorReplica() {
  return (
    <div
      aria-hidden="true"
      data-on-dark
      className="overflow-hidden rounded-2xl border border-[#2e2e2e] bg-[#1a1a1a] text-left shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)] dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[#2e2e2e] px-5 py-3.5">
        <span className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#22d3ee]/[0.12] text-[#22d3ee]">
            <Clock className="h-[15px] w-[15px]" strokeWidth={2} />
          </span>
          <span className="text-[14px] font-semibold tracking-tight text-[#e5e5e5]">New job</span>
        </span>
        <X className="h-4 w-4 text-[#919191]" strokeWidth={2} />
      </div>

      <div className="space-y-5 px-4 py-5 sm:px-5">
        <div className="flex items-center gap-3 rounded-xl border border-[#2e2e2e] bg-[#242424]/40 px-3 py-2.5">
          <span className="text-[16px]">📦</span>
          <span className="truncate text-[15px] font-semibold tracking-tight text-[#e5e5e5]">
            Nightly dependency update
          </span>
        </div>

        <div className="rounded-xl border border-[#2e2e2e] bg-[#242424]/40 px-4 py-3 text-[13px] leading-relaxed text-[#d4d4d4]">
          Update outdated dependencies to their latest compatible versions. Fix
          anything the upgrade breaks, run the tests, and summarize what changed.
        </div>

        <div>
          <div className={GROUP}>Details</div>
          <div className={CARD}>
            {DETAILS.map((row) => (
              <ReplicaFormRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
          <p className={NOTE}>
            Each run works in a new copy, leaving the project untouched. The next
            run waits until you&apos;ve looked at the last one and removed it.
          </p>
        </div>

        <div>
          <div className={GROUP}>Frequency</div>
          <div className={CARD}>
            {FREQUENCY.map((row) => (
              <ReplicaFormRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
          <p className={NOTE}>
            Every day at 02:00. It starts within a few minutes of that time, so
            automations set to the same hour don&apos;t all begin at once.
          </p>
        </div>

        <span className="flex items-center gap-1 text-[12px] font-medium text-[#919191]">
          <ChevronDown className="h-3 w-3 -rotate-90" strokeWidth={2} />
          Advanced
        </span>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-[#2e2e2e] px-5 py-3.5">
        <span className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#b3b3b3]">Cancel</span>
        <span className="rounded-lg bg-[#e5e5e5] px-4 py-2 text-[13px] font-medium text-[#1a1a1a]">
          Create job
        </span>
      </div>
    </div>
  );
}
