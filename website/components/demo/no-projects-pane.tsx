"use client";

import { FOCUS_RING, PRESS } from "./ui";

export function NoProjectsPane({ onAddProject }: { onAddProject: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-[13px] text-[#919191]">
        No projects left. Point lpm at a folder to get one back.
      </p>
      <button
        type="button"
        onClick={onAddProject}
        className={`rounded-lg border border-[#2e2e2e] bg-[#242424] px-3.5 py-2 text-[13px] font-medium text-[#e5e5e5] hover:bg-[#2a2a2a] ${PRESS} ${FOCUS_RING}`}
      >
        Add project
      </button>
    </div>
  );
}
