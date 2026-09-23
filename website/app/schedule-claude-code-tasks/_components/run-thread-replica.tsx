import { ArrowUp, ChevronDown, ChevronLeft } from "lucide-react";
import { ReplicaWindow } from "./replica-window";

const PICK = "flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-[#b3b3b3]";

export function RunThreadReplica() {
  return (
    <ReplicaWindow title="lpm — Automations" className="flex h-full flex-col">
      <div className="flex flex-1 flex-col px-4 pb-4 sm:px-5">
        <div className="flex items-center gap-2 pt-4">
          <ChevronLeft className="h-4 w-4 shrink-0 text-[#919191]" />
          <span className="grid h-8 w-8 shrink-0 place-items-center text-[17px]">📦</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold tracking-tight text-[#e5e5e5]">
              Nightly dependency update
            </span>
            <span className="block truncate text-[11px] text-[#919191]">saas-app · Done · 7h ago</span>
          </span>
        </div>

        <div className="mt-4 flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#22d3ee]" />
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#b3b3b3]">
            Done — checks passed in{" "}
            <span className="font-medium text-[#22d3ee]">saas-app-4k7m2q</span>
          </span>
          <span className="hidden shrink-0 text-[11px] tabular-nums text-[#919191] min-[400px]:inline">
            6m 12s · $0.84
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-[#919191]">7h ago</span>
        </div>
        <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-[#d4d4d4]">
          <p>Updated 9 packages in the copy. Tests pass.</p>
          <ul className="list-disc space-y-0.5 pl-5 marker:text-[#6b6b6b]">
            <li>vite 7 needed one change in vite.config.ts</li>
            <li>react-router and zod were drop-in upgrades</li>
            <li>eslint stays on 9: version 10 drops a plugin this project uses</li>
          </ul>
        </div>

        <div className="mt-4 flex justify-end">
          <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[#2f2f2f] px-3.5 py-2 text-[13px] leading-relaxed text-[#e5e5e5]">
            Try eslint 10 as well, and migrate the config if that&apos;s what it
            takes.
          </p>
        </div>

        <div className="mt-4 space-y-2 text-[13px] leading-relaxed text-[#d4d4d4]">
          <p>
            Done. Moved to eslint 10 and the flat config, swapped the old plugin
            for its maintained fork, and the lint and test runs are clean.
          </p>
        </div>
        <div className="mt-1.5 text-right text-[11px] tabular-nums text-[#919191]">
          3m 20s · $0.37 · 6h ago
        </div>

        <div className="mt-auto pt-4">
          <div className="rounded-xl border border-[#2e2e2e] bg-[#242424]/60">
            <p className="px-3.5 pb-2 pt-3 text-[13px] text-[#6b6b6b]">Reply…</p>
            <div className="flex items-center gap-1 px-2 pb-2">
              <span className={PICK}>
                Claude Code · Opus
                <ChevronDown className="h-3 w-3 text-[#919191]" />
              </span>
              <span className={PICK}>
                High
                <ChevronDown className="h-3 w-3 text-[#919191]" />
              </span>
              <span className="flex-1" />
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[#3a3a3a] text-[#919191]">
                <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.25} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </ReplicaWindow>
  );
}
