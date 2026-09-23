import { ChevronLeft, Pencil, Play } from "lucide-react";
import { ReplicaSwitch } from "./replica-switch";
import { ReplicaWindow } from "./replica-window";

const RUNS = [
  {
    label: "Done — checks passed",
    unread: true,
    stats: "1 reply · 6m 12s · $0.84",
    when: "6h ago",
    snippet:
      "Done. Moved to eslint 10 and the flat config, swapped the old plugin for its maintained fork, and the lint and test runs are clean.",
  },
  {
    label: "Done — checks failed",
    stats: "9m 40s · $1.12",
    when: "1d ago",
    snippet:
      "Upgraded prisma to the next major. Two migration tests fail against the new client, so I left the change in the copy for you to look at.",
  },
  {
    label: "Done — checks passed",
    stats: "4m 3s · $0.51",
    when: "2d ago",
    snippet: "Only patch releases today: 4 packages, no code changes needed.",
  },
];

export function RunListReplica() {
  return (
    <ReplicaWindow title="lpm — Automations" className="h-full">
      <div className="px-4 pb-4 sm:px-5">
        <div className="flex items-center gap-2 pt-4">
          <ChevronLeft className="h-4 w-4 shrink-0 text-[#919191]" />
          <span className="grid h-8 w-8 shrink-0 place-items-center text-[17px]">📦</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold tracking-tight text-[#e5e5e5]">
              Nightly dependency update
            </span>
            <span className="block truncate text-[11px] text-[#919191]">
              saas-app · Every day at 02:00 · Next run tomorrow at 02:00
            </span>
          </span>
          <span className="hidden shrink-0 items-center gap-1.5 px-1.5 text-[12px] font-medium text-[#b3b3b3] min-[440px]:flex">
            <Play className="h-3 w-3" fill="currentColor" />
            Run now
          </span>
          <span className="hidden shrink-0 items-center gap-1.5 px-1.5 text-[12px] font-medium text-[#b3b3b3] sm:flex">
            <Pencil className="h-3 w-3" />
            Edit
          </span>
          <ReplicaSwitch on />
        </div>
        <div className="mt-3">
          {RUNS.map((run) => (
            <div
              key={run.when}
              className={`flex gap-3 rounded-lg px-2 py-3 ${run.unread ? "bg-[#60a5fa]/[0.08]" : ""}`}
            >
              <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#22d3ee]" />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span
                    className={`truncate text-[13px] text-[#e5e5e5] ${run.unread ? "font-semibold" : "font-medium"}`}
                  >
                    {run.label}
                  </span>
                  {run.unread && (
                    <span className="shrink-0 rounded-full bg-[#60a5fa]/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.06em] text-[#60a5fa]">
                      New
                    </span>
                  )}
                  <span className="shrink-0 text-[11px] tabular-nums text-[#919191]">{run.stats}</span>
                </span>
                <span className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-[#919191]">
                  {run.snippet}
                </span>
              </span>
              <span className="shrink-0 pt-px text-[11px] tabular-nums text-[#919191]">{run.when}</span>
            </div>
          ))}
        </div>
      </div>
    </ReplicaWindow>
  );
}
