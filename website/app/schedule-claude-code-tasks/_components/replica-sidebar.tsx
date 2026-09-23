import { Ellipsis, History, SquareTerminal } from "lucide-react";
import { SIDEBAR_PROJECTS } from "./replica-jobs";

export function ReplicaSidebar() {
  return (
    <aside className="hidden w-48 shrink-0 flex-col border-r border-[#2e2e2e] bg-[#1e1e1e] sm:flex">
      <div className="px-4 pb-1.5 pt-4 text-[11px] font-medium uppercase tracking-wider text-[#919191]">
        Projects
      </div>
      <div className="flex flex-col gap-0.5 px-2">
        {SIDEBAR_PROJECTS.map((name) => (
          <span
            key={name}
            className="truncate rounded-md px-2.5 py-1.5 text-[13px] text-[#b3b3b3]"
          >
            {name}
          </span>
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-0.5 border-t border-[#2e2e2e] p-2">
        <span className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-[#b3b3b3]">
          <SquareTerminal className="h-3.5 w-3.5 text-[#919191]" strokeWidth={1.75} />
          Terminals
        </span>
        <span className="flex items-center gap-2 rounded-md bg-[#2a2a2a] px-2.5 py-1.5 text-[12px] font-medium text-[#e5e5e5]">
          <History className="h-3.5 w-3.5 text-[#b3b3b3]" strokeWidth={1.75} />
          Automations
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-medium text-[#22d3ee]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22d3ee] motion-safe:animate-pulse" />
            Running
          </span>
        </span>
        <span className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-[#b3b3b3]">
          <Ellipsis className="h-3.5 w-3.5 text-[#919191]" strokeWidth={1.75} />
          More
        </span>
      </div>
    </aside>
  );
}
