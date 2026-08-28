"use client";

import { Plus } from "lucide-react";
import { FOCUS_RING, PRESS } from "./ui";

export function CreateActionButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Create action"
      aria-label="Create action"
      className={`magic-ring group inline-flex h-8 shrink-0 rounded-lg p-px ${PRESS} ${FOCUS_RING}`}
    >
      <span className="flex h-full items-center gap-1 rounded-[7px] bg-[#1a1a1a] px-2.5 text-xs font-medium transition-colors duration-150 group-hover:bg-[color-mix(in_srgb,#a855f7_5%,#1a1a1a)]">
        <Plus className="h-3.5 w-3.5 text-[#b07be0]" strokeWidth={2} />
        <span className="hidden text-[#b3b3b3] transition-colors duration-150 group-hover:text-[#e5e5e5] sm:inline">
          Action
        </span>
      </span>
    </button>
  );
}
