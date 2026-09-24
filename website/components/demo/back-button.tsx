"use client";

import { ChevronLeft } from "lucide-react";
import { FOCUS_RING, PRESS } from "./ui";

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-3 flex items-center gap-1 rounded text-[11px] text-[#919191] transition-colors hover:text-[#e5e5e5] ${FOCUS_RING} ${PRESS}`}
    >
      <ChevronLeft size={14} strokeWidth={1.5} />
      Back
    </button>
  );
}
