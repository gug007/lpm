"use client";

import { Terminal } from "lucide-react";
import { InteractiveTerminal } from "./project-view";

export function GlobalTerminalsView() {
  return (
    <div className="relative flex flex-1 min-w-0 min-h-0 flex-col bg-[#1a1a1a]">
      <div className="flex h-12 shrink-0 items-center gap-2.5 px-3 sm:px-4">
        <span className="text-[#919191]">
          <Terminal className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <div className="text-base font-semibold leading-tight text-[#e5e5e5]">
            Terminals
          </div>
          <div className="text-[10px] text-[#919191]">
            Quick shells for scripts and system commands — not tied to a project
          </div>
        </div>
      </div>
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden border-t border-[#2e2e2e]">
        <div
          role="tablist"
          className="flex items-center gap-0.5 bg-[#2d2d2d] px-1.5 py-1"
        >
          <span className="flex items-center gap-1.5 rounded-md bg-white/[0.1] px-2 py-0.5 font-mono text-[11px] font-medium text-[#d4d4d4]">
            <Terminal className="h-3 w-3 text-[#8e8e8e]" strokeWidth={1.75} />
            shell
          </span>
        </div>
        <InteractiveTerminal projectRoot="~" />
      </div>
    </div>
  );
}
